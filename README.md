# Sistema de Joyería

App interna para registrar pagos a proveedores y recordatorios de pedidos de clientes. Plan de desarrollo en [docs/PLAN.md](docs/PLAN.md).

**Stack:** Next.js 16 · TypeScript · Tailwind CSS v4 · shadcn/ui · Prisma 7 · PostgreSQL 17 · Better Auth

## Requisitos

- Node.js 24 LTS (mínimo 20.19): `nvm install 24 && nvm alias default 24`
- Docker con integración WSL activada (Docker Desktop → Settings → Resources → WSL integration)

## Arranque local

```bash
cp .env.example .env              # solo la primera vez; genera BETTER_AUTH_SECRET con: openssl rand -base64 32
npm install                       # también genera el cliente de Prisma
npm run db:up                     # levanta PostgreSQL en el puerto 5433
npm run db:migrate                # aplica las migraciones
npm run db:seed                   # datos de ejemplo
npm run dev                       # http://localhost:3000
```

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Build y servidor de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | Verificación de tipos |
| `npm run db:up` / `db:down` | Levanta / detiene PostgreSQL en Docker (los datos se conservan) |
| `npm run db:migrate -- --name <cambio>` | Crea y aplica una migración. **Nunca usar `prisma db push`** |
| `npm run db:deploy` | Aplica migraciones pendientes (producción) |
| `npm run db:generate` | Regenera el cliente de Prisma tras cambiar el esquema |
| `npm run db:seed` | Carga datos de ejemplo |
| `npm run db:studio` | Explorador visual de la base |
| `npm test` | Pruebas (Vitest) |
| `npm run backup` | Respaldo de la base local en `backups/` |
| `npm run backup:test -- backups/<archivo>.dump` | Restaura un respaldo en una base temporal y compara |

Para borrar por completo la base local: `docker compose down -v`.

## Estructura

```
src/
  app/              rutas (App Router)
  modules/          un directorio por dominio: payments, reminders, clients, search, admin
  lib/              utilidades compartidas (db, fechas, dinero, auth)
  components/ui/    componentes de shadcn/ui
  generated/prisma/ cliente de Prisma (generado, no se versiona)
prisma/
  schema.prisma     modelos
  migrations/       historial de migraciones
  seed.ts           datos de ejemplo
  setup.ts          instalación en producción: catálogos base + usuario dueño
deploy/             compose de Easypanel, respaldo y restauración
Dockerfile          imagen de producción (la compila GitHub Actions)
```

## Producción

Docker en el VPS propio, administrado con **Easypanel** (detrás de su Traefik), con PostgreSQL 17 propio sin puertos publicados. GitHub Actions compila la imagen y la publica en `ghcr.io/gurdiny/admini-toga`; el VPS solo la descarga.

Paso a paso (primer deploy, crear al dueño, actualizar, respaldos diarios a Google Drive y restauración): **[docs/DEPLOY.md](docs/DEPLOY.md)**.

- Estado: `https://admin.toga.mx/api/health`
- Si faltan variables de entorno, la app no arranca y lo dice en el log del contenedor.
