#!/usr/bin/env bash
# Genera el compose de Easypanel con los valores ya escritos (Easypanel no pasa
# las variables de su pestaña Environment al compose).
#
#   bash /opt/toga-app/repo/deploy/render.sh
#
# Lee /opt/toga-app/.env.production y deploy/compose.template.yml, escribe
# /opt/toga-app/compose.resolved.yml (solo lectura para root) y lo muestra
# para copiarlo al editor del servicio en Easypanel.
set -euo pipefail

BASE=${TOGA_BASE:-/opt/toga-app}
ENV_FILE=${ENV_FILE:-$BASE/.env.production}
TEMPLATE=${TEMPLATE:-$(dirname "$(readlink -f "$0")")/compose.template.yml}
OUT=${OUT:-$BASE/compose.resolved.yml}

[[ -f $ENV_FILE ]] || { echo "✗ No existe $ENV_FILE (copia deploy/env.production.example)." >&2; exit 1; }
command -v envsubst >/dev/null || { echo "✗ Falta envsubst: apt install gettext-base" >&2; exit 1; }

set -a +u
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a -u
TOGA_IMAGE_TAG=${TOGA_IMAGE_TAG:-}
IMAGE=ghcr.io/gurdiny/admini-toga

problems=()
[[ -n ${APP_DOMAIN:-} ]] || problems+=("Falta APP_DOMAIN")
[[ ${POSTGRES_PASSWORD:-} =~ ^[A-Za-z0-9]{16,}$ ]] || problems+=("POSTGRES_PASSWORD: al menos 16 letras/números (openssl rand -hex 24)")
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET:-}
[[ ${#BETTER_AUTH_SECRET} -ge 32 ]] || problems+=("BETTER_AUTH_SECRET: al menos 32 caracteres (openssl rand -base64 32)")
[[ ${BETTER_AUTH_SECRET:-} != *[\"\\]* ]] || problems+=("BETTER_AUTH_SECRET no puede llevar comillas ni diagonal invertida")
[[ $TOGA_IMAGE_TAG =~ ^sha-[0-9a-f]{7}$ ]] || problems+=("TOGA_IMAGE_TAG debe ser el tag del commit (sha-abc1234), no «${TOGA_IMAGE_TAG:-vacío}»")
if ((${#problems[@]})); then
  printf '✗ %s\n' "${problems[@]}" >&2
  exit 1
fi

# El compose usa pull_policy: never: si la imagen no está en el servidor, el
# Deploy fallaría. Mejor avisar aquí.
if command -v docker >/dev/null && ! docker image inspect "$IMAGE:$TOGA_IMAGE_TAG" >/dev/null 2>&1; then
  echo "✗ La imagen $IMAGE:$TOGA_IMAGE_TAG no está en este servidor. Primero:" >&2
  echo "    docker pull $IMAGE:$TOGA_IMAGE_TAG" >&2
  exit 1
fi

export APP_DOMAIN POSTGRES_PASSWORD BETTER_AUTH_SECRET TOGA_IMAGE_TAG
umask 077
# Solo estas variables: cualquier otro $ del archivo se queda igual.
envsubst '${APP_DOMAIN} ${POSTGRES_PASSWORD} ${BETTER_AUTH_SECRET} ${TOGA_IMAGE_TAG}' <"$TEMPLATE" >"$OUT"

if grep -q '\${' "$OUT"; then
  echo "✗ Quedaron variables sin llenar en $OUT:" >&2
  grep -n '\${' "$OUT" >&2
  exit 1
fi

echo "✓ Compose listo en $OUT para la versión $TOGA_IMAGE_TAG (contiene contraseñas: no lo compartas)." >&2
echo "  Cópialo completo al servicio Compose de Easypanel:" >&2
echo >&2
cat "$OUT"
