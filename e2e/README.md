# Pruebas de punta a punta (E2E)

Recorren la app en Chrome como lo haría una persona: dan de alta proveedores,
registran adeudos y abonos, filtran pagos y revisan permisos de Dueño y Mostrador.

Crean registros con «E2E» en el nombre o concepto. Úsalas solo en la base de desarrollo.

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

## Limpiar los datos de prueba

```bash
npm run e2e:clean
```
