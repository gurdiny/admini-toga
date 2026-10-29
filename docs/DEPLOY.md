# Deploy en el VPS (Easypanel), respaldos y operación

Cómo poner TOGA en producción en el VPS, actualizarlo, respaldarlo y restaurarlo.

## Cómo está armado

```
GitHub (push a main)
  └─ Actions: lint + tipos + pruebas → compila la imagen → ghcr.io/gurdiny/admini-toga (privada)
                                                              │ root la descarga con un token read:packages
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

### 1.1 La imagen privada en GitHub (una sola vez)

1. Haz push a `main`. En GitHub → **Actions** → «Imagen Docker» espera a que salga en verde
   (primero corre lint, tipos y pruebas; luego compila y publica).
2. **Imagen privada**: GitHub → tu perfil → **Packages** → `admini-toga` → **Package settings** →
   *Danger zone* → *Change visibility* → **Private**. (Actions sigue publicando igual.)
   Comprueba que ya no se puede bajar sin credenciales (debe decir **401** o **403**):

   ```bash
   T=$(curl -s "https://ghcr.io/token?scope=repository:gurdiny/admini-toga:pull" | sed -E 's/.*"token":"([^"]*)".*/\1/')
   curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $T" \
     -H "Accept: application/vnd.oci.image.index.v1+json" https://ghcr.io/v2/gurdiny/admini-toga/manifests/latest
   ```

3. **Token de solo lectura para el VPS**: GitHub → *Settings* → *Developer settings* → *Personal access
   tokens* → **Tokens (classic)** → *Generate new token (classic)*. Nombre `vps-toga-pull`, marca
   **solo `read:packages`** y ponle vencimiento (p. ej. 1 año; anota la fecha: cuando venza, el
   `docker pull` dirá `unauthorized`). GitHub Container Registry no acepta los tokens *fine-grained*.
4. **En el VPS, como root** (el token no queda en el historial ni en variables):

   ```bash
   read -rsp "Token: " GHCR_TOKEN; echo
   printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u gurdiny --password-stdin
   unset GHCR_TOKEN
   chmod 600 /root/.docker/config.json
   stat -c '%a %U %n' /root/.docker/config.json     # → 600 root /root/.docker/config.json
   ```

   Docker guarda el token en `config.json` sin cifrar (por eso el aviso «stored unencrypted» y el
   permiso 600: solo root lo lee). Con `read:packages` lo único que permite es descargar imágenes.

### Versiones: el commit `sha-xxxxxxx`, nunca `latest`

Cada commit de `main` publica la imagen con el tag **`sha-` + los 7 primeros caracteres del commit**
(p. ej. `sha-d31f5f0`). El compose de Easypanel usa el tag **local** `:produccion` (nunca se publica):
`deploy/auto-deploy.sh` lo apunta a la imagen `sha-…` que toca y recrea `toga-app`. Qué commit corre:
`TOGA_IMAGE_TAG` en `.env.production` (lo actualiza el script) y el historial en
`/opt/toga-app/deploys.log`. (Actions también publica `latest`, pero producción nunca lo usa.)

El compose lleva `pull_policy: never`: **Easypanel nunca descarga la imagen**, solo usa la que bajó root.
Si no existe `:produccion`, `render.sh` se niega a generar el compose y dice qué correr.

### 1.2 DNS en Cloudflare

Registro **A** `admin` → `62.169.22.35` (listo). Si al emitir el certificado Traefik no lo logra, deja la
nube en gris (*DNS only*) hasta que tenga el certificado y luego regrésala como la tengas en `supabase`.

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
nano .env.production        # pega los dos valores, revisa APP_DOMAIN=admin.toga.mx
                            # y pon TOGA_IMAGE_TAG=sha-xxxxxxx (el commit a desplegar)

docker pull ghcr.io/gurdiny/admini-toga:sha-xxxxxxx   # el mismo tag (prueba también el token)
docker tag ghcr.io/gurdiny/admini-toga:sha-xxxxxxx ghcr.io/gurdiny/admini-toga:produccion
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

Pide nombre y correo, **genera la contraseña** y la imprime **una sola vez** en tu terminal (cuatro
grupos de minúsculas y números, fácil de escribir en el iPhone). Guárdala en ese momento en tu gestor de
contraseñas. No queda en archivos, logs (`docker logs` no ve la salida de `docker exec`), variables de
entorno ni en la auditoría; en la base solo queda su hash, como la de cualquier usuario. Si la salida no
es una terminal (por ejemplo `> archivo`), el script se niega a correr.

También carga las **categorías base** (8 de pago y 2 de proveedor). La base queda sin datos de negocio:
cero proveedores, pagos, clientes y recordatorios. La configuración usa sus valores por defecto hasta que
la guardes en **Admin → Configuración**.

Después entra a `https://admin.toga.mx` y da de alta al mostrador en **Admin → Usuarios**
(«Nuevo usuario», rol Mostrador, con la contraseña que tú le pongas).

> **¿El dueño olvidó su contraseña?** El mismo comando con su correo genera una nueva, lo deja como dueño
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

## 3. Actualizar (automático al hacer push a `main`)

Push a `main` → Actions corre lint, tipos y pruebas → publica `sha-xxxxxxx` → el job **«Desplegar en
producción»** entra al VPS y corre `deploy/auto-deploy.sh sha-xxxxxxx`, que:

1. actualiza `/opt/toga-app/repo` (`git pull`) y se vuelve a ejecutar con la versión nueva del script;
2. baja la imagen; si ya es la que corre, termina sin hacer nada;
3. saca un **respaldo local** de la base (la copia a Drive la hace el cron de las 4:15); sin respaldo no
   despliega;
4. apunta `:produccion` a la imagen nueva y recrea solo `toga-app` (la base no se toca); las migraciones
   se aplican al arrancar;
5. espera a que quede **healthy** (hasta 4 min). Si no, **regresa sola a la versión anterior** y el job
   sale en rojo. Las migraciones no se deshacen: si la versión fallida traía una, restaurar el respaldo
   del paso 3 (`restore.sh --replace`).

Todo queda en el log del job de GitHub y en `/opt/toga-app/deploys.log`. Un deploy a la vez (`flock`):
si un push nuevo cancela la ejecución a medio deploy, el VPS lo termina igual y el siguiente espera.

**La llave de GitHub** (secret `DEPLOY_SSH_KEY`, sin contraseña) está en `/root/.ssh/authorized_keys`
con `command="/opt/toga-app/repo/deploy/auto-deploy.sh",restrict`: solo puede correr ese script, sin
terminal ni túneles. Otros secrets del repo: `DEPLOY_HOST` (IP del VPS) y `DEPLOY_KNOWN_HOSTS`
(`ssh-keyscan -t ed25519 <IP>`, para no conectarse a un servidor impostor). Para revocarla, borrar esa
línea de `authorized_keys`.

Verificar a mano:

```bash
tail -20 /opt/toga-app/deploys.log
docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' toga-app   # commit completo
curl -s https://admin.toga.mx/api/health
```

### Regresar a una versión anterior

En GitHub → Actions → la ejecución en verde de ese commit → **Re-run all jobs**. O en el VPS, como root:
`bash /opt/toga-app/repo/deploy/auto-deploy.sh sha-ANTERIOR`. Ojo: las migraciones no se deshacen solas;
si la versión nueva cambió la base, restaura también el respaldo (`restore.sh --replace`).

### Si Easypanel se reinstala o se cambia el compose

La línea `image:` de `toga-app` debe ser `ghcr.io/gurdiny/admini-toga:produccion` (`render.sh` ya la genera
así). Si es otra, `auto-deploy.sh` se niega a desplegar y lo dice. El **Deploy** de Easypanel sigue
sirviendo: recrea con lo que apunte `:produccion`.

Para liberar disco, de vez en cuando: `docker image prune -a --filter "until=720h"` (borra imágenes sin
usar de más de 30 días; la que está corriendo no se toca).

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
