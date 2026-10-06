#!/usr/bin/env bash
# Respaldo de la base de TOGA: pg_dump en formato custom (-Fc), verificado,
# con retención local y copia a Google Drive con rclone.
#
# En el VPS (cron de root, ver docs/DEPLOY.md):
#   15 4 * * * /opt/toga-app/repo/deploy/backup.sh >> /opt/toga-app/backups/backup.log 2>&1
# En local (Postgres de docker-compose.yml): npm run backup
#
# Variables (con sus valores de producción por defecto):
#   DB_CONTAINER=toga-db  DB_USER=toga  DB_NAME=toga
#   BACKUP_DIR=/opt/toga-app/backups  KEEP_DAYS=14
#   RCLONE_REMOTE=gdrive:TOGA/respaldos  (vacío = no subir)  RCLONE_KEEP_DAYS=90
# Se pueden fijar en /opt/toga-app/backup.env.
set -euo pipefail

[[ -f /opt/toga-app/backup.env ]] && source /opt/toga-app/backup.env
DB_CONTAINER=${DB_CONTAINER:-toga-db}
DB_USER=${DB_USER:-toga}
DB_NAME=${DB_NAME:-toga}
BACKUP_DIR=${BACKUP_DIR:-/opt/toga-app/backups}
KEEP_DAYS=${KEEP_DAYS:-14}
RCLONE_REMOTE=${RCLONE_REMOTE-gdrive:TOGA/respaldos}
RCLONE_KEEP_DAYS=${RCLONE_KEEP_DAYS:-90}

log() { echo "[$(TZ=America/Mexico_City date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { log "✗ $*"; exit 1; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
# Un solo respaldo a la vez (si el anterior sigue corriendo, este no empieza).
exec 9>"$BACKUP_DIR/.lock"
flock -n 9 || fail "Ya hay un respaldo corriendo."

docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null | grep -q true || fail "El contenedor $DB_CONTAINER no está corriendo."

# Nombre con la fecha y hora de México: toga_2026-10-05_0415.dump
file="$BACKUP_DIR/${DB_NAME}_$(TZ=America/Mexico_City date '+%Y-%m-%d_%H%M').dump"
tmp="$file.partial"
umask 077

log "→ Respaldando $DB_NAME de $DB_CONTAINER…"
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --no-owner >"$tmp" || { rm -f "$tmp"; fail "pg_dump falló."; }
# Verificar que el archivo se puede leer antes de darlo por bueno.
docker exec -i "$DB_CONTAINER" pg_restore --list <"$tmp" >/dev/null || { rm -f "$tmp"; fail "El respaldo salió dañado (pg_restore --list)."; }
mv "$tmp" "$file"
log "✓ $(basename "$file") ($(du -h "$file" | cut -f1))"

# Retención local: los últimos KEEP_DAYS días.
deleted=$(find "$BACKUP_DIR" -maxdepth 1 -name "${DB_NAME}_*.dump" -mtime "+$((KEEP_DAYS - 1))" -print -delete | wc -l)
((deleted)) && log "  Borrados $deleted respaldos locales de más de $KEEP_DAYS días."

if [[ -n $RCLONE_REMOTE ]]; then
  command -v rclone >/dev/null || fail "Falta rclone (el respaldo local sí quedó)."
  rclone copy "$file" "$RCLONE_REMOTE" || fail "No se pudo subir a $RCLONE_REMOTE (el respaldo local sí quedó)."
  rclone delete "$RCLONE_REMOTE" --min-age "${RCLONE_KEEP_DAYS}d" --include "${DB_NAME}_*.dump" || log "  Aviso: no se pudieron borrar respaldos viejos en Drive."
  log "✓ Copiado a $RCLONE_REMOTE (se conservan $RCLONE_KEEP_DAYS días)."
fi
