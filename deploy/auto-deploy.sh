#!/usr/bin/env bash
# Despliegue automático de TOGA en el VPS. Lo llama GitHub Actions por SSH
# cuando la imagen sha-xxxxxxx de un commit de main ya está publicada
# (ver docs/DEPLOY.md, «3. Actualizar»).
#
# La llave de GitHub en /root/.ssh/authorized_keys solo puede correr esto:
#   command="/opt/toga-app/repo/deploy/auto-deploy.sh",restrict ssh-ed25519 AAAA… github-actions-deploy
# El tag llega en SSH_ORIGINAL_COMMAND. A mano, como root (p. ej. para
# regresar a una versión anterior):
#   bash /opt/toga-app/repo/deploy/auto-deploy.sh sha-abc1234
#
# Pasos: actualiza los scripts → baja la imagen → respaldo de la base →
# apunta el tag local :produccion a la versión nueva → recrea toga-app →
# espera a que quede healthy. Si no queda healthy, regresa :produccion a la
# versión anterior. Las migraciones NO se deshacen solas: para eso está el
# respaldo del paso 3 (restore.sh --replace).
set -euo pipefail
# Si GitHub cancela la ejecución o se cae la conexión, el deploy termina igual.
trap '' HUP PIPE

BASE=/opt/toga-app
REPO=$BASE/repo
IMAGE=ghcr.io/gurdiny/admini-toga
LIVE=$IMAGE:produccion
EASYPANEL_DIR=/etc/easypanel/projects/toga/admintoga/code
PROJECT=toga_admintoga
APP=toga-app
LOG=$BASE/deploys.log
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-240}

TAG=${1:-${SSH_ORIGINAL_COMMAND:-}}
if [[ ! $TAG =~ ^sha-[0-9a-f]{7}$ ]]; then
  echo "✗ Uso: auto-deploy.sh sha-abc1234 (recibido: «${TAG:-vacío}»)" >&2
  exit 2
fi

# Primero los scripts al día y se vuelve a ejecutar la versión nueva de este
# archivo (git reemplaza el archivo, el bash que ya corre no se entera).
if [[ -z ${TOGA_DEPLOY_UPDATED:-} ]]; then
  git -C "$REPO" pull --ff-only -q
  TOGA_DEPLOY_UPDATED=1 exec bash "$REPO/deploy/auto-deploy.sh" "$TAG"
fi

# Todo va a la pantalla (log de GitHub Actions) y a deploys.log. tee -p sigue
# escribiendo el archivo aunque se cierre la conexión.
exec > >(tee -p -a "$LOG") 2>&1

log() { echo "[$(TZ=America/Mexico_City date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { log "✗ $*"; exit 1; }

compose() {
  docker compose -p "$PROJECT" --project-directory "$EASYPANEL_DIR" \
    -f "$EASYPANEL_DIR/docker-compose.yml" -f "$EASYPANEL_DIR/docker-compose.override.yml" "$@"
}

wait_healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT)) status
  while ((SECONDS < deadline)); do
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$APP" 2>/dev/null || echo "sin contenedor")
    case $status in
      healthy) return 0 ;;
      unhealthy) return 1 ;;
    esac
    sleep 5
  done
  return 1
}

# Un deploy a la vez: si llegan dos commits seguidos, el segundo espera.
exec 9>"$BASE/.deploy.lock"
flock -w 900 9 || fail "Otro deploy lleva más de 15 minutos: revisar a mano."

log "→ Deploy de $TAG"
grep -q "image: $LIVE\$" "$EASYPANEL_DIR/docker-compose.yml" ||
  fail "En Easypanel la línea image: de $APP debe ser $LIVE (ver docs/DEPLOY.md)."

docker pull -q "$IMAGE:$TAG" >/dev/null || fail "No se pudo bajar $IMAGE:$TAG."
new_id=$(docker image inspect -f '{{.Id}}' "$IMAGE:$TAG")
prev_id=$(docker inspect -f '{{.Image}}' "$APP" 2>/dev/null || true)
prev_tag=$(grep -E '^TOGA_IMAGE_TAG=' "$BASE/.env.production" | cut -d= -f2 || true)

if [[ $new_id == "$prev_id" ]]; then
  log "✓ $APP ya corre $TAG. Nada que hacer."
  exit 0
fi

# Respaldo local antes de tocar nada (la copia a Drive la hace el cron de las 4:15).
RCLONE_REMOTE= "$REPO/deploy/backup.sh" || fail "Sin respaldo no se despliega."

docker tag "$new_id" "$LIVE"
# Si compose falla, wait_healthy también falla y se regresa a la anterior.
compose up -d --no-deps --force-recreate "$APP" || log "✗ docker compose up falló."
log "  Esperando a que $APP quede sana (migraciones incluidas)…"

if wait_healthy; then
  sed -i "s/^TOGA_IMAGE_TAG=.*/TOGA_IMAGE_TAG=$TAG/" "$BASE/.env.production"
  log "✓ Producción corre $TAG (antes: ${prev_tag:-?})."
  exit 0
fi

log "✗ $TAG no quedó sana. Últimas líneas del contenedor:"
docker logs --tail 40 "$APP" 2>&1 || true
if [[ -n $prev_id ]]; then
  log "↩ Regresando a ${prev_tag:-la versión anterior}…"
  docker tag "$prev_id" "$LIVE"
  compose up -d --no-deps --force-recreate "$APP" || true
  if wait_healthy; then
    log "↩ Producción regresó a ${prev_tag:-la versión anterior}. Si $TAG traía migración, la base ya cambió: revisar."
  else
    log "✗✗ La versión anterior tampoco arrancó: revisar a mano YA (docker logs $APP)."
  fi
fi
exit 1
