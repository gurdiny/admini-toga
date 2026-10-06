#!/usr/bin/env bash
# Restaurar un respaldo de TOGA (pg_restore).
#
#   restore.sh --test  archivo.dump   restaura en una base temporal, compara cuántos
#                                     registros hay contra la base actual y la borra.
#                                     No toca nada: úsalo para probar los respaldos.
#   restore.sh --into  nombre archivo.dump   restaura en otra base (la crea si no existe).
#   restore.sh --replace archivo.dump        REEMPLAZA la base real: detiene la app,
#                                     saca antes un respaldo de seguridad y pide confirmar.
#
# Mismas variables que backup.sh (DB_CONTAINER, DB_USER, DB_NAME…) y además
# APP_CONTAINER=toga-app (se detiene durante --replace).
# En local: npm run backup:test -- backups/joyeria_….dump
set -euo pipefail

[[ -f /opt/toga-app/backup.env ]] && source /opt/toga-app/backup.env
DB_CONTAINER=${DB_CONTAINER:-toga-db}
DB_USER=${DB_USER:-toga}
DB_NAME=${DB_NAME:-toga}
APP_CONTAINER=${APP_CONTAINER-toga-app}
HERE=$(dirname "$(readlink -f "$0")")

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
psqlc() { docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$1" -v ON_ERROR_STOP=1 -Atq -c "$2"; }
restore_into() { docker exec -i "$DB_CONTAINER" pg_restore -U "$DB_USER" -d "$1" --no-owner --no-privileges --exit-on-error "${@:2}" <"$FILE"; }

TABLES=(users categories suppliers supplier_debts supplier_payments clients order_reminders audit_logs app_settings)
counts() {
  local sql="" t
  for t in "${TABLES[@]}"; do sql+="SELECT '$t', count(*) FROM $t UNION ALL "; done
  psqlc "$1" "${sql% UNION ALL }" | tr '|' ' '
}

MODE=${1:-}
case $MODE in
  --test) FILE=${2:-} ;;
  --into) TARGET=${2:-}; FILE=${3:-} ;;
  --replace) FILE=${2:-} ;;
  *) usage ;;
esac
[[ -n ${FILE:-} && -f $FILE ]] || { echo "✗ No encuentro el archivo de respaldo: ${FILE:-(vacío)}" >&2; usage; }
docker exec -i "$DB_CONTAINER" pg_restore --list <"$FILE" >/dev/null || { echo "✗ $FILE no es un respaldo válido." >&2; exit 1; }

case $MODE in
  --test)
    tmp="${DB_NAME}_prueba_$(date +%s)"
    trap 'psqlc postgres "DROP DATABASE IF EXISTS \"$tmp\"" >/dev/null 2>&1 || true' EXIT
    echo "→ Restaurando $(basename "$FILE") en la base temporal $tmp…"
    psqlc postgres "CREATE DATABASE \"$tmp\""
    restore_into "$tmp"
    echo
    printf '%-20s %10s %10s\n' "tabla" "respaldo" "actual"
    ok=1
    while read -r t backup && read -r _ live <&3; do
      mark=""; [[ $backup == "$live" ]] || mark="  ← distinto"
      printf '%-20s %10s %10s%s\n' "$t" "$backup" "$live" "$mark"
      ((backup > 0)) || [[ $t == audit_logs ]] || [[ $t == app_settings ]] || ok=0
    done < <(counts "$tmp") 3< <(counts "$DB_NAME")
    echo
    echo "✓ El respaldo se restauró completo. (Las diferencias son lo capturado después del respaldo.)"
    ((ok)) || echo "  Aviso: hay tablas vacías en el respaldo; revisa que sea el archivo correcto."
    ;;
  --into)
    [[ $TARGET =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "✗ Nombre de base inválido: $TARGET" >&2; exit 1; }
    [[ $TARGET != "$DB_NAME" ]] || { echo "✗ Para la base real usa --replace." >&2; exit 1; }
    exists=$(psqlc postgres "SELECT 1 FROM pg_database WHERE datname = '$TARGET'")
    [[ -n $exists ]] || psqlc postgres "CREATE DATABASE \"$TARGET\""
    restore_into "$TARGET" --clean --if-exists
    echo "✓ Restaurado en la base $TARGET."
    counts "$TARGET"
    ;;
  --replace)
    echo "⚠ Esto REEMPLAZA la base $DB_NAME con $(basename "$FILE")."
    echo "  Todo lo capturado después de ese respaldo se pierde (antes se saca un respaldo de seguridad)."
    read -r -p "  Escribe el nombre de la base ($DB_NAME) para continuar: " answer
    [[ $answer == "$DB_NAME" ]] || { echo "Cancelado."; exit 1; }
    echo "→ Respaldo de seguridad antes de restaurar…"
    RCLONE_REMOTE="" "$HERE/backup.sh"
    if [[ -n $APP_CONTAINER ]] && docker inspect "$APP_CONTAINER" >/dev/null 2>&1; then
      echo "→ Deteniendo $APP_CONTAINER…"
      docker stop "$APP_CONTAINER" >/dev/null
      trap 'echo "→ Arrancando $APP_CONTAINER…"; docker start "$APP_CONTAINER" >/dev/null' EXIT
    fi
    echo "→ Restaurando…"
    restore_into "$DB_NAME" --clean --if-exists --single-transaction
    echo "✓ Base $DB_NAME restaurada."
    counts "$DB_NAME"
    ;;
esac
