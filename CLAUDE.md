@AGENTS.md

# Sistema de Joyería — Pagos a proveedores y recordatorios

App interna para una joyería: captura de pagos a proveedores, checklist de pedidos de clientes y panel de administración. Dos usuarios (dueño y empleado), uso principal desde celular en el mostrador/taller.

El plan completo por fases está en [docs/PLAN.md](docs/PLAN.md). **Trabaja una sola fase por sesión** y no avances hasta que la verificación de esa fase pase.

## Estado de fases

- [x] Fase 0 — Infraestructura y repositorio
- [x] Fase 1 — Modelo de datos (Prisma)
- [x] Fase 2 — Autenticación y roles
- [x] Fase 3 — Capa de datos, validación y zona horaria
- [ ] Fase 4 — Módulo de pagos
- [ ] Fase 5 — Recordatorios / checklist
- [ ] Fase 6 — Panel de administración
- [ ] Fase 7 — Reportes, exportación y búsqueda
- [ ] Fase 8 — Deploy, respaldos y operación

Al cerrar una fase: marcarla aquí y hacer commit (`feat(fase-N): ...`).

## Stack

- Next.js 16 (App Router, `output: 'standalone'`) + TypeScript estricto, Node 24 LTS
- Tailwind CSS v4 + shadcn/ui + lucide-react
- Prisma 7 (`prisma-client` → `src/generated/prisma`, `prisma.config.ts`, `@prisma/adapter-pg`)
- PostgreSQL 17: en desarrollo, contenedor de [docker-compose.yml](docker-compose.yml); en producción, contenedor en el VPS
- Better Auth (email + contraseña, registro público deshabilitado)
- Zod, date-fns + date-fns-tz, Recharts, exceljs
- Vitest para pruebas
- Hosting: VPS propio con Docker (app + Postgres + Caddy). La base nunca publica puertos en producción

## Reglas no negociables

1. **Fechas**: los timestamps (`createdAt`, `completedAt`, `deletedAt`) se guardan en UTC. Las columnas `@db.Date` (`SupplierPayment.date`, `OrderReminder.targetDate`) guardan el **día calendario de México** como medianoche UTC de ese día. Todo se muestra en `America/Mexico_City` (`APP_TIMEZONE`). Nunca usar `new Date()` directo para comparar o clasificar fechas: usar `src/lib/date.ts` (`getToday`, `getTomorrow`, `getRange`, `dayRangeWhere`, `startOfDayInTZ`…). En código, un día calendario es `DayKey` ("yyyy-MM-dd"); `zDay` lo entrega ya convertido a `Date` para Prisma. Las funciones de fecha no dependen de la zona horaria de la máquina (probado con 5 zonas). "Hoy", "Mañana" y "Atrasados" se calculan en servidor.
2. **Dinero**: montos como `Decimal` de Prisma (`Decimal(12,2)`), nunca `float`/`number` para sumar. Usar `src/lib/money.ts`. Moneda por defecto MXN, pero el campo `currency` existe desde el inicio.
3. **Borrado lógico**: todo borrado es `deletedAt = now()`. Nunca `delete` físico. Toda consulta de listados/totales filtra `deletedAt: null`.
4. **Migraciones**: siempre `npx prisma migrate dev --name <descripcion>`. **Nunca `prisma db push`.**
5. **Server Actions** se escriben con `defineAction()` de `src/lib/action.ts`, que fija el orden: verificar rol (`requireRole`) → validar con Zod → ejecutar (escrituras dentro de `withAudit`) → `revalidatePath` → devolver `Result<T>`. Nunca lanzan hacia el cliente: `toFailure()` de `src/lib/errors.ts` traduce todo a español. Para errores de negocio esperados, lanzar `BusinessError("mensaje para el usuario")`.
6. **Texto capturado a mano** se normaliza con `src/lib/normalize.ts` antes de guardar: `nameKey` (`toNameKey`) es la llave única de proveedores y categorías, el folio va en mayúsculas (`normalizeFolio`) y el teléfono en 10 dígitos (`normalizePhoneMX`). Nunca buscar duplicados por `name`.
7. **Catálogos administrables**: categorías, proveedores y configuración viven en la base (`Category`, `Supplier`, `AppSetting`), no en enums ni constantes del código.
8. **Roles**: `OWNER` ve todo; `STAFF` captura pagos y recordatorios pero no ve montos totales ni `/admin`. Ocultar en UI no basta: se valida en servidor.
9. **Seguridad de rutas**: `proxy.ts` solo redirige a `/login`; nunca es la barrera de seguridad (CVE-2025-29927). La sesión y el rol se verifican en cada layout de servidor y al inicio de cada Server Action.

## Marca TOGA

Tokens en `src/app/globals.css` (tomados de toga.mx), mapeados al tema de shadcn. Reglas:

- **Botón principal en negro** (`primary` = `#1a1a1a`), como el logo. Nunca texto blanco sobre el verde `#90ac53` (contraste 2.6:1, ilegible).
- **Verde** (`toga-green`) para foco, estados positivos y "liquidado"; como texto usar `text-toga-green-strong` (`#4f6b24`). Fondo suave: `bg-toga-green-soft`.
- **Rojo** `#aa3a3e` = `destructive` (borrar, atrasados). Rosa, azul y violeta para gráficas (`chart-1..5`) y chips de categoría.
- Fondo de página `#f5f5f5`, tarjetas blancas, radio 12px.
- Tipografía: Neulis Neue (texto, 400/700) y Neulis Sans Bold (h1–h3), auto-hospedadas en `src/app/fonts/`. Neulis Sans no tiene peso regular publicado, por eso no se usa para texto corrido.
- Logo: `TogaLogo` (con PLATA.925) y `TogaWordmark` (solo TOGA) en `src/components/brand/`. Favicon en `src/app/icon.png`.

## Estructura

Carpetas por dominio, no por tipo de archivo:

```
src/
  app/                 # rutas (App Router)
  modules/
    payments/          # actions.ts, schemas.ts, components/
    reminders/
    admin/
  lib/                 # date.ts, money.ts, result.ts, auth, prisma, audit
  components/ui/       # solo componentes generados por shadcn
prisma/
  schema.prisma
  migrations/
  seed.ts
docs/
  PLAN.md
```

Un módulo nuevo (inventario, ventas…) es una carpeta nueva en `src/modules/`, sin tocar los existentes.

## Convenciones

- Interfaz, mensajes de error y textos visibles **en español (México)**. Código, nombres de variables y commits técnicos pueden ir en inglés.
- Mobile first: tarjetas grandes, áreas táctiles de al menos 44 px; en celular las tablas se convierten en tarjetas.
- Filtros de listados persistidos en search params de la URL.
- Todo listado tiene estado de carga, estado vacío con mensaje útil y confirmación antes de eliminar.
- Teléfonos de clientes se muestran como enlace a WhatsApp (`https://wa.me/52XXXXXXXXXX`).
- Nunca commitear `.env`; documentar toda variable nueva en `.env.example`.

## Comandos

```bash
npm run db:up                          # Postgres local en Docker (puerto 5433)
npm run dev                            # servidor local
npm run db:migrate -- --name xxx       # nueva migración (nunca db push)
npm run db:generate                    # regenerar cliente tras cambiar el esquema
npm run db:seed                        # datos de ejemplo (Prisma 7 no lo corre al migrar)
npm run db:studio                      # explorar la base
npm test                               # Vitest (fechas, dinero, esquemas, errores)
npm run lint && npm run typecheck      # antes de cada commit
npm run build                          # verificar build de producción
```

Usuarios del seed (solo desarrollo): `dueno@joyeria.local` (OWNER) y `mostrador@joyeria.local` (STAFF), contraseña `joyeria-dev-2026` (o `SEED_PASSWORD`).

Variables: [.env.example](.env.example) documenta todas. Se usa el puerto 5433 porque 5432 lo ocupa otro contenedor del usuario (pgvector-dev).

## Notas técnicas

- Prisma fijado en **7.10.x**: el tag `latest` de npm apunta a Prisma 8 RC. No actualizar a 8 sin decidirlo.
- Cliente de Prisma: `import { db } from "@/lib/db"`. Tipos y enums desde `@/generated/prisma/client`. Referencias de Prisma 7 en `.claude/skills/prisma-*`.
- Prisma 7 no carga `.env` solo: `prisma.config.ts` empieza con `import "dotenv/config"`.
- Next.js 16: antes de escribir código de Next leer la guía correspondiente en `node_modules/next/dist/docs/` (ver AGENTS.md). Tipos globales como `LayoutProps`/`PageProps` se generan con `next typegen`.
- Better Auth: el hash de contraseña vive en `Account.password` con `providerId = "credential"` y `accountId = user.id`. Las relaciones hacia `User` de datos de negocio usan `onDelete: Restrict` (los usuarios se desactivan, no se borran).
- `SupplierPayment.orderId` apunta a `OrderReminder`: el recordatorio es el pedido del cliente.
- **Crédito con proveedores**: `SupplierDebt` es lo que se debe (`OPENING_BALANCE` = saldo que ya existía al dar de alta al proveedor; `CREDIT` = mercancía a crédito). `SupplierPayment.debtId` lo convierte en abono; sin `debtId` es pago de contado. El saldo nunca se guarda: `amount − Σ abonos con deletedAt null`. La base impide abonar a un adeudo de otro proveedor (FK compuesta `[debtId, supplierId]`) y montos ≤ 0 (CHECK). Triggers de Postgres (migración `debt_balance_guard`) impiden que los abonos excedan el saldo, abonar a un adeudo eliminado o en otra moneda, bajar el monto de un adeudo por debajo de lo abonado y eliminar un adeudo con abonos vigentes. Lanzan `check_violation` con el mensaje iniciando en un código estable (`ABONO_EXCEDE_SALDO`, `MONEDA_DISTINTA`, `ADEUDO_ELIMINADO`, `ADEUDO_CON_ABONOS`, `MONTO_MENOR_A_ABONADO`) que las Server Actions traducen a un mensaje en español. La Server Action valida también antes, para dar un error amable.
- Códigos visibles: `code` autoincremental, mostrado como `PROV-0001`, `ADE-0001`, `PAG-0001`. El `id` (cuid) es interno y nunca se muestra.
- Los CHECK constraints se agregan a mano al final del `migration.sql`; Prisma no los genera ni los detecta como drift.
- **Auth** (`src/lib/auth/`): `config.ts` (Better Auth, registro deshabilitado, sesión 30 días, sin cookieCache para que desactivar/cambiar rol aplique al instante), `session.ts` (`getCurrentUser`, `requireUser` y `requirePageRole` para layouts/páginas —redirigen—, `requireRole` para Server Actions —lanza `AuthorizationError`—; OWNER pasa cualquier `requireRole`), `actions.ts` (login/logout). Rutas protegidas viven en el grupo `src/app/(app)/`; `/admin` tiene su propio layout con `requirePageRole("OWNER")`.
- **Auditoría**: toda escritura pasa por `withAudit()` de `src/lib/audit.ts`, que corre la escritura y el `AuditLog` en una sola transacción. Para UPDATE/DELETE pasar `before` para obtener el diff.
- **Validación**: piezas compartidas en `src/lib/validation.ts` (`zText`, `zMoney` → string "1250.50", `zDay` → Date, `zOptionalPhone`, `zOptionalFolio`, `zCheckbox`…). Esquemas por módulo en `src/modules/*/schemas.ts`; sirven igual para el formulario (cliente) y la acción (servidor). En Zod 4, un campo opcional se marca con `.optional()`/`.nullish()`; un `union` con `z.undefined()` NO lo hace opcional.
- **Dinero**: `src/lib/money.ts` (`parseMoney`, `toDecimal`, `sumDecimals`, `formatMXN`, `moneyToString`). Funciona en cliente y servidor. Un `Decimal` no cruza a Client Components: convertir con `moneyToString()`.
- Scripts sueltos que importan módulos con `server-only`: `npx tsx --conditions=react-server archivo.ts`.
- shadcn/ui: estilo `radix-nova`, componentes con `npx shadcn@latest add <componente>`.
- Para exportar a Excel usar `exceljs`: el paquete `xlsx` publicado en npm está desactualizado y con vulnerabilidades conocidas.
- El modelo `User` debe ser compatible con Better Auth: el hash de la contraseña vive en `Account.password`, no en `User`.
