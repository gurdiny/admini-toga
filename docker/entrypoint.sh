#!/bin/sh
# Arranque del contenedor: aplica migraciones pendientes y levanta Next.js.
# Si la migración falla, el contenedor se detiene (no arranca con un esquema viejo).
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "✗ Falta DATABASE_URL: el contenedor no puede arrancar." >&2
  exit 1
fi

echo "→ Aplicando migraciones de la base…"
cd /app/migrate
node node_modules/prisma/build/index.js migrate deploy

echo "→ Iniciando TOGA en el puerto ${PORT:-3000}"
cd /app
exec node server.js
