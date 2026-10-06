# Imagen de producción de TOGA. La compila GitHub Actions
# (.github/workflows/docker.yml) y el VPS solo la descarga de ghcr.io.
#
#   docker build -t toga-app .        # probar en local
#
# Debian slim (no Alpine): el motor de migraciones de Prisma es un binario
# para glibc y necesita OpenSSL.
ARG NODE_IMAGE=node:24-bookworm-slim

# ─── 1. Dependencias ──────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
# `npm ci` corre `prisma generate` (postinstall): necesita el esquema y una URL
# cualquiera (no se conecta a nada al generar).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ─── 2. Compilación ───────────────────────────────────────────────────────
FROM deps AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
# Better Auth se inicializa al recolectar las páginas y sin secreto llena el log
# de errores. Valor de relleno solo para este comando: no es variable de la
# imagen y esta etapa no se publica. La app no arranca sin el secreto real
# (src/lib/env.ts).
RUN BETTER_AUTH_SECRET="solo-para-compilar-no-se-usa-en-la-imagen-final" \
    BETTER_AUTH_URL="http://localhost:3000" \
    npm run build
# Script de instalación (dueño + catálogos) en un solo archivo: la imagen final
# no trae tsx ni el código fuente.
RUN npx esbuild prisma/setup.ts --bundle --platform=node --format=esm --target=node24 \
      --conditions=react-server --alias:@=./src --log-level=warning \
      --banner:js="import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" \
      --outfile=dist/setup.mjs

# ─── 3. Migraciones ───────────────────────────────────────────────────────
# Solo el CLI de Prisma (misma versión del package-lock) para `migrate deploy`
# al arrancar. Separado de la app: el standalone de Next.js no lo incluye.
FROM ${NODE_IMAGE} AS migrator
WORKDIR /migrate
COPY package-lock.json /tmp/package-lock.json
RUN v() { node -p "require('/tmp/package-lock.json').packages['node_modules/$1'].version"; } \
 && echo '{"private":true}' > package.json \
 && npm install --no-audit --no-fund --omit=dev "prisma@$(v prisma)" "dotenv@$(v dotenv)" \
 && npm cache clean --force

# ─── 4. Imagen final ──────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=UTC

# Usuario sin privilegios (viene en la imagen oficial de Node, uid 1000).
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/dist/setup.mjs ./setup.mjs
COPY --from=migrator --chown=node:node /migrate/node_modules ./migrate/node_modules
COPY --chown=node:node prisma.config.ts ./migrate/
COPY --chown=node:node prisma/schema.prisma ./migrate/prisma/schema.prisma
COPY --chown=node:node prisma/migrations ./migrate/prisma/migrations
COPY --chown=node:node docker/entrypoint.sh /usr/local/bin/entrypoint.sh

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
