# Deploy en el VPS (Easypanel), respaldos y operación

Cómo poner TOGA en producción en el VPS, actualizarlo, respaldarlo y restaurarlo.

## Cómo está armado

```
GitHub (push a main)
  └─ Actions: lint + tipos + pruebas → compila la imagen → ghcr.io/gurdiny/admini-toga
                                                              │ (el VPS solo descarga)
VPS 62.169.22.35 ─ Easypanel ─ servicio Compose «toga»        ▼
  ├─ toga-app   Next.js (imagen de ghcr.io), puerto 3000 interno
  │              al arrancar: prisma migrate deploy → node server.js
  ├─ toga-db    postgres:17-alpine, SIN puertos publicados, datos en /opt/toga-app/postgres
  └─ Traefik (el de Easypanel) → https://admin.toga.mx → toga-app:3000

cron de root 4:15 → deploy/backup.sh → /opt/toga-app/backups (14 días) → rclone → Google Drive (90 días)
```

Lo que **no** se toca: n8n, Supabase, la configuración de Traefik (`main.yaml` se regenera sola), el
cron `/root/backup-diario.sh` de las 3:30 y el firewall (solo 22/80/443 abiertos; la app no necesita más).

### Carpetas en el VPS

| Ruta | Qué es |
| --- | --- |
| `/opt/toga-app/repo` | Este repositorio (solo para los scripts de `deploy/`) |
| `/opt/toga-app/.env.production` | Contraseñas y dominio (permisos 600, nunca se sube a GitHub) |
| `/opt/toga-app/compose.resolved.yml` | Compose con los valores ya escritos (lo que se pega en Easypanel) |
| `/opt/toga-app/postgres` | Datos de Postgres |
| `/opt/toga-app/backups` | Respaldos `toga_AAAA-MM-DD_HHMM.dump` y `backup.log` |
| `/opt/toga-app/backup.env` | Opcional: cambia destino o retención de los respaldos |

### Las tres trampas de Easypanel (ya resueltas)

1. **Las variables de la pestaña Environment llegan vacías al compose.** Por eso `deploy/render.sh` escribe
   los valores reales dentro del YAML. No uses la pestaña Environment para esta app.
2. **Las rutas relativas no funcionan.** El compose solo usa rutas absolutas (`/opt/toga-app/...`).
3. **El dominio va antes del primer Deploy.** Orden: crear servicio → crear dominio → Deploy. Si despliegas
   antes, el override de red sale vacío y Traefik responde 502.

## 1. Primer deploy

### 1.1 La imagen en GitHub (una sola vez)

1. Haz push a `main`. En GitHub → **Actions** → «Imagen Docker» espera a que salga en verde
   (primero corre lint, tipos y pruebas; luego compila).
2. La primera vez la imagen queda **privada**. Hazla pública para que el VPS la descargue sin contraseña
   (el código ya es público y la imagen no lleva secretos):
   GitHub → tu perfil → **Packages** → `admini-toga` → **Package settings** → *Change visibility* → **Public**.
3. Prueba desde el VPS: `docker pull ghcr.io/gurdiny/admini-toga:latest`.

> Si prefieres dejarla privada: en el VPS, `docker login ghcr.io -u gurdiny` con un token de GitHub
> (classic) que solo tenga el permiso `read:packages`.

### 1.2 DNS en Cloudflare

Registro **A** `admin` → `62.169.22.35`, igual que `supabase.toga.mx`. Si al emitir el certificado
Traefik no lo logra, deja la nube en gris (*DNS only*) hasta que tenga el certificado y luego regrésala
como la tengas en `supabase`.

### 1.3 Archivos en el VPS

```bash
sudo -i
apt install -y gettext-base rclone          # envsubst (para render.sh) y rclone
mkdir -p /opt/toga-app && cd /opt/toga-app
git clone https://github.com/gurdiny/admini-toga.git repo

cp repo/deploy/env.production.example .env.production
chmod 600 .env.production
openssl rand -hex 24        # → POSTGRES_PASSWORD
openssl rand -base64 32     # → BETTER_AUTH_SECRET
nano .env.production        # pega los dos valores y revisa APP_DOMAIN=admin.toga.mx

bash repo/deploy/render.sh  # valida y muestra el compose listo para copiar
```

Guarda una copia de `.env.production` en tu gestor de contraseñas: sin `POSTGRES_PASSWORD` no se puede
conectar a la base, y si cambia `BETTER_AUTH_SECRET` todos tienen que volver a iniciar sesión.

### 1.4 Servicio en Easypanel (respeta el orden)

1. **Crear**: proyecto `toga` → *+ Service* → **Compose** → nombre `toga`. Pega **todo** lo que imprimió
   `render.sh` en el editor del compose y guarda. **Todavía no le des Deploy.**
2. **Dominio**: pestaña *Domains* del servicio → *Add domain* → host `admin.toga.mx`, HTTPS activado,
   servicio **`toga-app`**, puerto **3000**.
3. **Deploy**.

### 1.5 Verificar

```bash
docker logs -f toga-app                 # «Aplicando migraciones…» → «Iniciando TOGA…»
curl -s https://admin.toga.mx/api/health    # {"status":"ok","db":"ok",...}
docker ps --filter name=toga            # los dos «healthy»
docker port toga-db                     # vacío: Postgres no publica puertos
```

Si en vez de arrancar el log dice **«La app no puede arrancar: revisa las variables de entorno»**, la
lista que sigue dice qué falta: corrige `.env.production`, vuelve a correr `render.sh`, pega y Deploy.

### 1.6 Crear al dueño (base vacía)

```bash
docker exec -it toga-app node setup.mjs
```

Pide nombre, correo y contraseña (no se ve al escribirla) y carga las categorías y la configuración base
(sin datos de ejemplo). Después entra a `https://admin.toga.mx` y da de alta al mostrador en
**Admin → Usuarios**.

> **¿El dueño olvidó su contraseña?** El mismo comando con su correo le pone una nueva, lo deja como dueño
> activo y cierra sus sesiones: `docker exec -it toga-app node setup.mjs --email gera@toga.mx --name "Gera"`.

## 2. Respaldos

### 2.1 Conectar Google Drive (una sola vez)

El VPS no tiene navegador, así que la autorización se hace en tu computadora:

1. En Windows instala rclone (<https://rclone.org/downloads/>) y corre `rclone authorize "drive"`.
   Se abre el navegador; entra con la cuenta de Google donde quieres los respaldos. Copia el texto
   `{"access_token":...}` que imprime.
2. En el VPS: `rclone config` → `n` (nuevo) → nombre **`gdrive`** → tipo `drive` → deja *client_id* y
   *client_secret* vacíos → *scope* `1` (acceso completo) → sin *service account* → *Edit advanced config*
   `n` → *Use web browser* **`n`** → pega el texto del paso 1 → *Shared drive* `n` → confirma.
3. Prueba: `rclone mkdir gdrive:TOGA/respaldos && rclone lsd gdrive:TOGA`.

### 2.2 Programar el respaldo diario

```bash
/opt/toga-app/repo/deploy/backup.sh       # primer respaldo a mano: debe terminar con «✓ Copiado a gdrive:…»
crontab -e
# agrega esta línea (4:15, para no chocar con /root/backup-diario.sh de las 3:30):
15 4 * * * /opt/toga-app/repo/deploy/backup.sh >> /opt/toga-app/backups/backup.log 2>&1
```

Cada respaldo se verifica con `pg_restore --list` antes de darlo por bueno. En el VPS se guardan 14 días
y en Drive 90. Para cambiar destino o días, crea `/opt/toga-app/backup.env`:

```bash
RCLONE_REMOTE=gdrive:TOGA/respaldos
KEEP_DAYS=14
RCLONE_KEEP_DAYS=90
```

### 2.3 Probar que el respaldo sirve (cada mes)

```bash
/opt/toga-app/repo/deploy/restore.sh --test /opt/toga-app/backups/toga_2026-10-05_0415.dump
```

Lo restaura en una base temporal, muestra cuántos registros tiene cada tabla junto a la base real y
borra la temporal. **No toca la base real.** Un respaldo que nunca se probó no cuenta como respaldo.

Para probar uno bajado de Drive: `rclone copy gdrive:TOGA/respaldos/toga_….dump /tmp/` y la misma línea.

### 2.4 Restaurar de verdad (desastre)

```bash
/opt/toga-app/repo/deploy/restore.sh --replace /opt/toga-app/backups/toga_2026-10-05_0415.dump
```

Pide escribir el nombre de la base para confirmar, saca antes un respaldo de seguridad de lo que hay,
detiene `toga-app`, restaura todo en una sola transacción (si falla, la base queda como estaba) y vuelve a
arrancar la app. Lo capturado después de ese respaldo se pierde.

Para revisar un respaldo sin reemplazar nada: `restore.sh --into toga_revision archivo.dump` crea la base
`toga_revision` a un lado (bórrala al terminar: `docker exec toga-db dropdb -U toga toga_revision`).

### 2.5 Probar en local (Postgres de docker-compose.yml)

```bash
npm run db:up
npm run backup                                  # → backups/joyeria_AAAA-MM-DD_HHMM.dump (no sube a Drive)
npm run backup:test -- backups/joyeria_….dump   # restaura en una base temporal y compara
```

## 3. Actualizar

1. Push a `main` y espera el ✓ verde en GitHub Actions (si las pruebas fallan, no se publica imagen).
2. En el VPS: `docker pull ghcr.io/gurdiny/admini-toga:latest`
3. En Easypanel: **Deploy** del servicio `toga`. Las migraciones nuevas se aplican solas al arrancar.
4. Verifica: `curl -s https://admin.toga.mx/api/health` y `docker logs --tail 30 toga-app`.

Antes de un cambio grande (sobre todo si trae migración), saca un respaldo a mano:
`/opt/toga-app/repo/deploy/backup.sh`.

Si cambias algo de `.env.production` o del compose: `cd /opt/toga-app/repo && git pull`,
`bash deploy/render.sh`, pega el resultado en Easypanel y Deploy.

### Regresar a una versión anterior

Cada commit publica también la etiqueta `sha-abc1234` (la ves en GitHub → Packages). En
`.env.production` pon `TOGA_IMAGE_TAG=sha-abc1234`, corre `render.sh`, pega y Deploy. Ojo: las
migraciones no se deshacen solas; si la versión nueva cambió la base, restaura el respaldo previo.

## 4. Rutina

| Cuándo | Qué |
| --- | --- |
| Cada semana | Que el respaldo del día esté en Drive: `rclone ls gdrive:TOGA/respaldos \| tail -3` y `tail /opt/toga-app/backups/backup.log` |
| Cada mes | `restore.sh --test` con el último respaldo |
| Si un total no cuadra | Admin → Auditoría: quién cambió qué y cuándo |
| Si la app no abre | `docker ps --filter name=toga`, `docker logs --tail 50 toga-app`, `curl …/api/health` |

### Recursos

`toga-app` tiene un límite de 768 MB de RAM y `toga-db` de 512 MB, para que nunca le quiten memoria a n8n
ni a Supabase. Con dos usuarios, normalmente usan menos de la mitad (`docker stats toga-app toga-db`).
