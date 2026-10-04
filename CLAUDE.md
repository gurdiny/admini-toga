@AGENTS.md

# Sistema de Joyería — Pagos a proveedores y recordatorios

App interna para una joyería: captura de pagos a proveedores, checklist de pedidos de clientes y panel de administración. Dos usuarios (dueño y empleado), uso principal desde celular en el mostrador/taller.

El plan completo por fases está en [docs/PLAN.md](docs/PLAN.md). **Trabaja una sola fase por sesión** y no avances hasta que la verificación de esa fase pase.

## Estado de fases

- [x] Fase 0 — Infraestructura y repositorio
- [x] Fase 1 — Modelo de datos (Prisma)
- [x] Fase 2 — Autenticación y roles
- [x] Fase 3 — Capa de datos, validación y zona horaria
- [x] Fase 4 — Módulo de pagos (rediseño mobile first incluido)
- [ ] Fase 5 — Recordatorios / checklist
- [ ] Fase 6 — Panel de administración
- [ ] Fase 7 — Reportes, exportación y búsqueda
- [ ] Fase 8 — Deploy, respaldos y operación

Al cerrar una fase: marcarla aquí, hacer commit (`feat(fase-N): ...`) y entregar al usuario **dos listas de pruebas**:
1. Las que hizo Claude (pruebas automatizadas, curl, scripts) con su resultado.
2. Las que debe hacer el usuario a mano: checklist numerado con usuario, pasos y lo que debe verse (incluir celular cuando aplique).

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
8. **Roles** (matriz única en `src/lib/auth/permissions.ts`; nunca comparar roles sueltos):
   - **Mostrador (`STAFF`)** hace la captura diaria para quitarle carga al dueño: pagos, abonos, adeudos, **proveedores**, clientes y recordatorios. Ve montos individuales y el saldo de cada proveedor (los necesita para abonar), pero **no** los totales generales (`canViewTotals`): total pagado del periodo, total por pagar, rankings, gráficas, reportes.
   - **Borrar** (`canDelete`): el dueño siempre; el mostrador solo lo que él capturó **hoy** (día de México).
   - **Dueño (`OWNER`)**: todo lo anterior + totales + `/admin` (categorías, usuarios, auditoría, papelera, configuración, fusionar clientes).
   - Ocultar en la UI no basta: cada Server Action valida con `requireRole` y, al borrar, con `canDelete`.
9. **Seguridad de rutas**: `proxy.ts` solo redirige a `/login`; nunca es la barrera de seguridad (CVE-2025-29927). La sesión y el rol se verifican en cada layout de servidor y al inicio de cada Server Action.

## Marca TOGA y diseño

**Mobile first de verdad**: el mostrador y el taller usan la app solo en el celular. Se diseña primero a 390 px y la tabla de escritorio es un extra (`xl:`).

Tokens en `src/app/globals.css` (tomados de toga.mx, tema WordPress + WooCommerce), mapeados al tema de shadcn. No se importa el CSS de WordPress: se replican sus tokens y patrones.

- **Acción principal**: `<Button variant="brand">` = rosa TOGA en píldora (`#c23d73`, texto blanco 5:1). El rosa original `#d67da1` solo para íconos/acentos (2.9:1, no lleva texto). Botones secundarios negros/outline. Todos los botones son píldora (`rounded-full`) y de al menos 40 px de alto.
- **Verde** (`toga-green`) para estados positivos y "Al corriente"; como texto `text-toga-green-strong`. **Rojo** `#aa3a3e` = `destructive`.
- Tarjetas: `bg-card shadow-toga rounded-2xl` (sombra suave de toga.mx), sin bordes duros. Fondo `#f5f5f5`.
- **Navegación celular**: barra inferior como la de toga.mx (Inicio · Pagos · ➕ · Proveedores · Menú). El ➕ rosa registra un pago desde cualquier pantalla (dentro de `/proveedores/[id]` ya trae el proveedor). Admin, cerrar sesión y el cambio de usuario de desarrollo están en «Menú».
- **Diálogos**: en celular son paneles que suben desde abajo con el botón de guardar pegado abajo; desde `sm` son ventanas centradas.
- Tipografía: Neulis Neue (texto, 400/700) y Neulis Sans Bold (h1–h3), auto-hospedadas en `src/app/fonts/`.
- Logo: `TogaLogo` y `TogaWordmark` en `src/components/brand/`. Favicon en `src/app/icon.png`.

## Negocio

TOGA vende **solo plata .925**. Sus proveedores son de **joyería** (piezas terminadas) o **mano de obra** (engaste, soldadura, pulido, grabado). Categorías de pago: Anillos, Aretes, Pulseras, Cadenas, Collares, Dijes, Mano de obra, Otros. **Casi todo se paga en efectivo** (método por defecto). Nada de oro ni piedras preciosas en ejemplos.

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
npm test                               # Vitest (fechas, dinero, esquemas, errores, permisos, filtros)
npm run e2e:clean                      # borra datos de las pruebas E2E (ver e2e/README.md)
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
- **Login automático en desarrollo**: con `DEV_AUTO_LOGIN="correo"` en `.env`, `npm run dev` entra solo con ese usuario del seed (pasa por el login real de Better Auth vía `/api/dev/login`). La barra "Dev:" abajo a la derecha cambia de usuario en un clic; `/login?salir=1` muestra el formulario real. Todo está en `src/lib/dev/` y se apaga solo en producción (`NODE_ENV !== "development"`: la ruta da 404 y el proxy manda a `/login`).
- **Patrón de pantallas** (ver `src/modules/payments/`): `queries.ts` (server-only, devuelve datos serializables: montos string, días `DayKey`), `actions/*.ts` (`defineAction`), `components/` (client). Los diálogos de formulario separan el `Dialog` del `Form` interno: el formulario se monta al abrir y siempre arranca limpio. En formularios `useAction(..., { errorToast: false })` (el error ya se ve dentro). Listados: tarjetas en celular (`md:hidden`) y tabla en escritorio (`hidden md:block`). Filtros en la URL (`filters.ts`). Permisos por fila se calculan en el servidor y se pasan como booleanos.
- **Pruebas E2E** en `e2e/` con playwright-core y el Chrome de Windows (Chromium no corre en este WSL sin `sudo`). Crean datos con «E2E»; limpiar con `npm run e2e:clean`.
- **Probar en el celular** (desarrollo): `allowedDevOrigins` en `next.config.ts` y `trustedOrigins` de Better Auth aceptan IPs de red local solo en desarrollo. WSL en modo NAT no es alcanzable desde el teléfono: hace falta `networkingMode=mirrored` en `%UserProfile%\.wslconfig` y abrir el puerto 3000 en el firewall de Windows.
- Avisos de hidratación con `caret-color` vienen de Playwright (capturas) y con `bis_*`/`cz-shortcut-listen` de extensiones del navegador: no son errores de la app.
- Scripts sueltos que importan módulos con `server-only`: `npx tsx --conditions=react-server archivo.ts`.
- shadcn/ui: estilo `radix-nova`, componentes con `npx shadcn@latest add <componente>`.
- Para exportar a Excel usar `exceljs`: el paquete `xlsx` publicado en npm está desactualizado y con vulnerabilidades conocidas.
- El modelo `User` debe ser compatible con Better Auth: el hash de la contraseña vive en `Account.password`, no en `User`.
