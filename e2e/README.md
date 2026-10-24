# Pruebas de punta a punta (E2E)

Recorren la app en Chrome como lo haría una persona: dan de alta proveedores,
registran adeudos y abonos, filtran pagos y revisan permisos de Dueño y Mostrador.

Crean registros con «E2E» en el nombre o concepto. Úsalas solo en la base de desarrollo.
Lo que la interfaz no puede crear (un pedido capturado ayer) se prepara con `sql()`
de `config.cjs`, que usa el `DATABASE_URL` de `.env`.

## Cómo correrlas (WSL + Chrome de Windows)

En WSL a Chromium le faltan librerías del sistema, así que se usa el Node y el
Chrome de Windows:

```bash
npm run dev                         # en otra terminal, con DEV_AUTO_LOGIN en .env
"/mnt/c/Program Files/nodejs/node.exe" "$(wslpath -w e2e/proveedores.e2e.cjs)"
"/mnt/c/Program Files/nodejs/node.exe" "$(wslpath -w e2e/pagos.e2e.cjs)"
"/mnt/c/Program Files/nodejs/node.exe" "$(wslpath -w e2e/recordatorios.e2e.cjs)"   # en celular (390 px)
"/mnt/c/Program Files/nodejs/node.exe" "$(wslpath -w e2e/admin.e2e.cjs)"           # panel de administración (dueño y mostrador)
"/mnt/c/Program Files/nodejs/node.exe" "$(wslpath -w e2e/reportes.e2e.cjs)"        # búsqueda global, historial del cliente, exportar (celular)
"/mnt/c/Program Files/nodejs/node.exe" "$(wslpath -w e2e/layout.e2e.cjs)"          # diseño en 6 anchos: sin desbordes, áreas táctiles ≥ 40 px
```

Variables opcionales: `E2E_BASE_URL` (por defecto `http://localhost:3000`) y
`CHROME_PATH`. Las capturas quedan en `e2e/screenshots/` (no se versiona).

**Ojo con las variables y el Node de Windows**: lo que se exporta en WSL no
llega a `node.exe` salvo que esté en `WSLENV`. Para apuntar a otro servidor:

```bash
WSLENV=E2E_BASE_URL E2E_BASE_URL=http://localhost:3001 \
  "/mnt/c/Program Files/nodejs/node.exe" "$(wslpath -w e2e/layout.e2e.cjs)"
```

Sin `WSLENV` la prueba se va al 3000 sin avisar y las fallas no tienen sentido.

## Probar contra una base sembrada, sin tocar la de desarrollo

Las pruebas necesitan datos (proveedores activos, pedidos de varios días). Si
la base de desarrollo está vacía o revuelta, conviene levantar una copia:

```bash
docker exec joyeria-db-1 psql -U joyeria -d joyeria -c 'CREATE DATABASE joyeria_e2e;'
DATABASE_URL="postgresql://joyeria:joyeria_dev@localhost:5433/joyeria_e2e" npx prisma migrate deploy
DATABASE_URL="postgresql://joyeria:joyeria_dev@localhost:5433/joyeria_e2e" npm run db:seed
```

Next 16 no deja dos `next dev` en la misma carpeta, así que el segundo servidor
va en una copia del proyecto (con `node_modules` enlazado con `cp -al`, no con
un symlink: Turbopack rechaza enlaces que salen de la carpeta) y su propio
`.env` apuntando a `joyeria_e2e`.

## Limpiar los datos de prueba

```bash
npm run e2e:clean
```
