# Sistema de Joyería — Pagos a proveedores y recordatorios

App interna para una joyería: captura de pagos a proveedores, checklist de pedidos de clientes y panel de administración. Dos usuarios (dueño y empleado), uso principal desde celular en el mostrador/taller.

El plan completo por fases está en [docs/PLAN.md](docs/PLAN.md). **Trabaja una sola fase por sesión** y no avances hasta que la verificación de esa fase pase.

## Estado de fases

- [ ] Fase 0 — Infraestructura y repositorio
- [ ] Fase 1 — Modelo de datos (Prisma)
- [ ] Fase 2 — Autenticación y roles
- [ ] Fase 3 — Capa de datos, validación y zona horaria
- [ ] Fase 4 — Módulo de pagos
- [ ] Fase 5 — Recordatorios / checklist
- [ ] Fase 6 — Panel de administración
- [ ] Fase 7 — Reportes, exportación y búsqueda
- [ ] Fase 8 — Deploy, respaldos y operación

Al cerrar una fase: marcarla aquí y hacer commit (`feat(fase-N): ...`).

## Stack

- Next.js (App Router) + TypeScript estricto
- Tailwind CSS v4 + shadcn/ui + lucide-react
- Prisma + PostgreSQL (Neon o Supabase)
- Auth.js con credenciales + bcrypt
- Zod, date-fns + zona horaria, Recharts, exportación a Excel
- Vitest para pruebas
- Hosting: Vercel

## Reglas no negociables

1. **Fechas**: se guardan siempre en UTC y se muestran en `America/Mexico_City` (`APP_TIMEZONE`). Nunca usar `new Date()` directo para comparar o clasificar fechas en Server Actions: usar los helpers de `src/lib/date.ts`. "Hoy", "Mañana" y "Atrasados" se calculan en servidor.
2. **Dinero**: montos como `Decimal` de Prisma (`Decimal(12,2)`), nunca `float`/`number` para sumar. Usar `src/lib/money.ts`. Moneda por defecto MXN, pero el campo `currency` existe desde el inicio.
3. **Borrado lógico**: todo borrado es `deletedAt = now()`. Nunca `delete` físico. Toda consulta de listados/totales filtra `deletedAt: null`.
4. **Migraciones**: siempre `npx prisma migrate dev --name <descripcion>`. **Nunca `prisma db push`.**
5. **Server Actions** siguen siempre este orden: validar con Zod → verificar rol (`requireRole`) → ejecutar → auditar (`withAudit`) → `revalidatePath` → devolver `Result<T>`. No lanzar excepciones hacia el cliente.
6. **Catálogos administrables**: categorías, proveedores y configuración viven en la base (`Category`, `Supplier`, `AppSetting`), no en enums ni constantes del código.
7. **Roles**: `OWNER` ve todo; `STAFF` captura pagos y recordatorios pero no ve montos totales ni `/admin`. Ocultar en UI no basta: se valida en servidor.

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

> Se completan al terminar la Fase 0.

```bash
npm run dev                         # servidor local
npx prisma migrate dev --name xxx   # nueva migración
npx prisma db seed                  # datos de ejemplo
npx prisma studio                   # explorar la base
npm run test                        # Vitest
npm run backup                      # respaldo JSON (Fase 8)
```

## Notas para la Fase 0

- Verificar versiones actuales antes de instalar (Next.js, Prisma, Auth.js, Tailwind) con la documentación oficial; el plan se escribió pensando en Next.js 15 y algunas APIs cambiaron en versiones posteriores (p. ej. `middleware.ts` → `proxy.ts` en Next 16, `prisma.config.ts` y adaptadores de driver en Prisma 7).
- `create-next-app` se niega a correr en un directorio con archivos ajenos (`CLAUDE.md`). Generar el proyecto en un directorio temporal y mover los archivos aquí, fusionando el `.gitignore` existente.
- Para exportar a Excel preferir `exceljs`: el paquete `xlsx` publicado en npm está desactualizado y con vulnerabilidades conocidas.
