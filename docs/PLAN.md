# Plan de Desarrollo por Fases — Sistema de Joyería

3 oct 2026 · @GERA URIAS · v2.2 (4 oct 2026: hosting en VPS propio, Postgres en Docker, User compatible con Better Auth, adeudos y abonos a proveedores)

## Qué faltaba en el plan original

El plan v1.0 resuelve bien la captura y los reportes, pero deja fuera doce cosas que después cuestan rehacer. Todas están incorporadas en las fases de abajo.

| Hueco | Por qué importa | Fase |
| --- | --- | --- |
| Proveedor y cliente son texto libre | "Juan", "JUAN" y "Juan Pérez" cuentan como tres proveedores distintos; el Top Proveedor sale mal | 1 |
| No hay usuarios ni roles | Sin esto el panel de administración no tiene sobre qué pararse | 2 |
| No hay auditoría | Nadie sabe quién editó o borró un pago, ni cuándo | 1 y 2 |
| Borrado físico de registros | Un pago borrado por error no se recupera | 1 |
| Pedido y pago están desconectados | No puedes saber cuánto costó una pieza ni su margen | 1 |
| Sin control de crédito con proveedores | Los proveedores dan mercancía a crédito y se paga en abonos; hay que saber cuánto se le debe a cada uno y dar de alta la deuda que ya existía | 1 y 4 |
| Categorías escritas en el código | Cada categoría nueva exige un deploy | 1 y 6 |
| Zona horaria sin resolver | "Hoy" calculado en UTC clasifica mal todo pedido capturado después de las 18:00 en CDMX | 3 |
| Sin respaldos de la base | Si se pierde la base, se pierde todo | 8 |
| Sin hosting definido | El plan nunca dice dónde vive la app | 0 y 8 |
| Sin búsqueda | Buscar el folio #JOY-8492 de hace tres meses no tiene cómo hacerse | 7 |
| Sin exportación | El contador va a pedir Excel | 7 |

## Decisiones antes de escribir código

| Decisión | Elegido | Por qué |
| --- | --- | --- |
| Hosting | VPS propio con Docker: app Next.js + PostgreSQL + Caddy | Ya tienes el VPS. La base nunca se expone a internet: la app la alcanza por la red interna de Docker. Caddy da HTTPS automático |
| Base de datos | PostgreSQL 17. En desarrollo, el contenedor de `docker-compose.yml`; en producción, contenedor en el VPS | Mismo motor y misma versión en los dos lados: lo que migra en local migra igual en producción |
| Autenticación | Better Auth con email y contraseña, registro público deshabilitado | Auth.js v5 sigue en beta y sus propios mantenedores recomiendan Better Auth para proyectos nuevos |
| Dominio | Un subdominio apuntando al VPS | Caddy necesita un dominio para emitir el certificado HTTPS |
| Moneda | MXN, con campo de moneda desde el día uno | Si algún día compras oro en USD, el esquema ya lo soporta |

Costo real esperado: $0 adicional; corre en el VPS que ya pagas.

Lo que cambia por no usar una base administrada: **los respaldos son responsabilidad tuya**. La Fase 8 los automatiza, pero hay que probar la restauración al menos una vez.

Una regla que conviene fijar desde ahora: todas las fechas se guardan en UTC y se muestran en `America/Mexico_City`. Nunca se guarda una fecha ya convertida.

## Fase 0 — Infraestructura y repositorio

Antes de cualquier pantalla. Si esto queda mal, todo lo demás se arrastra.

Requisitos previos: Node.js 24 LTS (Prisma 7 pide 20.19 o superior) y Docker funcionando en WSL. Levanta la base antes de empezar: `docker compose up -d`.

```
claude "Crea un proyecto Next.js 16 con App Router, TypeScript estricto, Tailwind CSS v4, Shadcn UI, Lucide React y Prisma 7 con PostgreSQL. El repositorio ya existe con CLAUDE.md, .gitignore, .gitattributes, docker-compose.yml, .env.example y .env: create-next-app no corre en un directorio con archivos, así que genera el proyecto en un directorio temporal, mueve los archivos aquí y fusiona el .gitignore sin perder sus reglas.

Estructura las carpetas por dominio, no por tipo de archivo: /src/modules/payments, /src/modules/reminders, /src/modules/admin, cada uno con sus propios actions, components y schemas; /src/lib para utilidades compartidas; /src/components/ui solo para Shadcn.

Configuración de Prisma 7, que cambió respecto a v6: el generador usa provider = 'prisma-client' con un output explícito en ./src/generated/prisma; crea prisma.config.ts con import 'dotenv/config', la URL de la base, la ruta de migraciones y el comando de seed, porque el schema ya no lleva datasource.url y Prisma 7 ya no carga .env solo; instala el driver adapter @prisma/adapter-pg junto con pg, ahora obligatorio para PostgreSQL, e instancia PrismaClient con ese adaptador en /src/lib/db.ts como singleton.

En next.config.ts activa output: 'standalone' para poder empaquetar la app en Docker en la Fase 8.

Agrega Zod, date-fns y date-fns-tz. Agrega scripts npm: db:up (docker compose up -d), db:down, db:migrate (prisma migrate dev), db:generate, db:seed, db:studio. Usa prisma migrate dev para todo cambio de esquema, nunca db push. Crea un README con los comandos de arranque."
```

Qué verificar antes de seguir: `npm run dev` levanta sin errores, `npx prisma migrate dev` corre limpio contra el Postgres de Docker, y la carpeta `/src/modules` existe con las tres subcarpetas vacías.

La estructura por módulos es lo que hace escalable el proyecto. Agregar inventario mañana será crear `/src/modules/inventory` sin tocar nada más.

## Fase 1 — Modelo de datos completo

La fase más importante. Cambiar el esquema con datos reales adentro es caro; vale la pena modelarlo entero aunque al inicio no uses todo.

```
claude "Diseña el esquema Prisma completo con estos modelos:

User, compatible con Better Auth: id, name, email único, emailVerified, image opcional, role (enum OWNER|STAFF, default STAFF), isActive, createdAt, updatedAt. El hash de la contraseña NO va en User: Better Auth lo guarda en Account.password. Agrega los modelos que Better Auth requiere (Session, Account, Verification) con los campos exactos de su documentación actual o generados con su CLI.

Supplier: id, code consecutivo (PROV-0001), name con nameKey normalizado único, category (relación), contactName, phone, hasWhatsApp, email, address, notes, isActive, createdAt. Ningún dato de contacto es obligatorio. Reemplaza el supplierName de texto libre.

SupplierDebt: id, code consecutivo (ADE-0001), supplierId, kind (enum OPENING_BALANCE|CREDIT), date, description, amount Decimal(12,2), currency, categoryId opcional, dueDate opcional, supplierRef opcional, notes, createdById, deletedAt opcional. El saldo no se guarda: es amount menos la suma de sus abonos.

Category: id, name único, type (enum SUPPLIER|PAYMENT), color, sortOrder, isActive. Catálogo administrable, no enum fijo.

Client: id, name, phone, folio único opcional, notes, createdAt. Un cliente tiene muchos OrderReminder.

SupplierPayment: id, code consecutivo (PAG-0001), date, supplierId, categoryId, concept, amount Decimal(12,2), currency (default MXN), exchangeRate Decimal(10,4) opcional, paymentMethod (enum EFECTIVO|TRANSFERENCIA|TARJETA|CHEQUE), debtId opcional (abono a un adeudo del mismo proveedor; null = pago de contado), orderId opcional, createdById, deletedAt opcional, createdAt, updatedAt.

OrderReminder: id, clientId, targetDate Date, targetTime String opcional, note Text, isCompleted, completedAt opcional, completedById opcional, priority (enum NORMAL|ALTA), deletedAt opcional, createdById, createdAt, updatedAt.

AuditLog: id, userId, action (enum CREATE|UPDATE|DELETE), entity String, entityId String, changes Json, createdAt. Índice en [entity, entityId] y en createdAt.

AppSetting: id, key único, value Json. Para configuración editable desde el panel sin deploy.

Índices: SupplierPayment en [date, supplierId] y [deletedAt]; OrderReminder en [targetDate, isCompleted] y [clientId]; Client en [phone] y [folio].

Todo borrado es lógico mediante deletedAt; nunca uses delete físico. Crea un seed con 2 usuarios (con contraseña creada a través de la API de Better Auth, no insertando hashes a mano), 8 categorías típicas de joyería, 5 proveedores y 10 registros de ejemplo."
```

Qué verificar: la migración corre, el seed llena la base, y `npx prisma studio` muestra las relaciones conectadas.

Los campos que hoy parecen de más — `orderId` en el pago, `currency`, `AppSetting`, `priority` — son exactamente los que evitan rehacer el esquema dentro de un año.

## Fase 2 — Autenticación y roles

Dos roles bastan: dueño y mostrador. La idea es quitarle carga al dueño: el mostrador hace toda la captura diaria (pagos, abonos, adeudos, proveedores, clientes y recordatorios) y ve el saldo de cada proveedor; el dueño puede todo eso y además ve los totales generales, administra catálogos y usuarios y revisa la auditoría. Borrar: el dueño siempre; el mostrador solo lo que él capturó hoy.

```
claude "Implementa autenticación con Better Auth sobre PostgreSQL y Prisma, con email y contraseña, sin proveedores sociales. Variables: BETTER_AUTH_SECRET y BETTER_AUTH_URL (ya están en .env.example).

Deshabilita el registro público (disableSignUp): los usuarios solo los crea un OWNER desde /admin/usuarios o el seed. Usa los campos role e isActive del modelo User como additionalFields; un usuario con isActive = false no puede iniciar sesión. Sesión de 30 días para no pedir contraseña cada día en el mostrador.

Crea /login con formulario simple y mensaje de error visible.

Protección de rutas: Next.js 16 renombró middleware.ts a proxy.ts y ahora corre en runtime Node. Usa proxy.ts únicamente para redirigir a /login a quien no trae sesión, nunca como barrera de seguridad: por CVE-2025-29927 el middleware es evadible. La verificación real de sesión y de rol va dentro de cada layout de servidor y al inicio de cada Server Action.

Helpers: getCurrentUser() para leer la sesión en servidor y requireRole(role) que lance error si no hay permiso. OWNER accede a todo; STAFF accede a pagos y recordatorios pero no a /admin ni a los totales del dashboard.

Crea un wrapper withAudit() que envuelva toda Server Action de escritura y registre en AuditLog el usuario, la acción, la entidad y el diff de cambios."
```

Qué verificar: entrar como STAFF y confirmar que `/admin` redirige; intentar registrarse desde fuera y confirmar que falla; al crear un pago aparece un renglón nuevo en `AuditLog`.

El `withAudit()` es el detalle que más se agradece después. Sin él, cuando un total no cuadre, no hay forma de saber qué pasó.

## Fase 3 — Capa de datos, validación y zona horaria

Esta fase no produce ninguna pantalla visible, y es la que evita el 90% de los bugs silenciosos.

```
claude "Crea la capa compartida en /src/lib:

1. date.ts con funciones de zona horaria usando date-fns-tz: startOfDayInTZ(date), endOfDayInTZ(date), getToday(), getTomorrow(), formatForDisplay(date). Todas operan en America/Mexico_City y devuelven UTC para consultar la base. Ninguna Server Action debe usar new Date() directamente para comparar fechas.

2. money.ts para trabajar montos como Decimal de Prisma, nunca como float. Funciones toDecimal(string), formatMXN(decimal), sumDecimals(array).

3. result.ts con un tipo Result<T> = { ok: true, data: T } | { ok: false, error: string } que toda Server Action devuelva. Nada de lanzar excepciones hacia el cliente.

4. Esquemas Zod por módulo en /src/modules/*/schemas.ts, validando en servidor antes de tocar la base: monto mayor a cero, fecha no más de un año en el futuro, nombre de cliente obligatorio, identificador de cliente obligatorio.

Aplica en todas las Server Actions: validar con Zod, verificar rol, ejecutar, registrar auditoría, revalidatePath, devolver Result."
```

Qué verificar: crea un pago con monto negativo y confirma que la app devuelve un error legible en vez de romperse. Captura un recordatorio para "mañana" a las 11 de la noche hora de México y confirma que cae en el día correcto.

Ese segundo caso es el bug clásico de estos sistemas: con fechas en UTC, todo lo capturado después de las 6 de la tarde se clasifica un día adelante.

## Fase 4 — Módulo de pagos a proveedores

```
claude "Construye el módulo de pagos en /src/modules/payments.

Server Actions: createPayment, updatePayment, softDeletePayment, getPayments(filters), getPaymentsSummary(range). El resumen agrupa por día, semana, mes o rango libre usando los helpers de zona horaria, y devuelve total, conteo, total por proveedor y total por categoría. Excluye siempre los registros con deletedAt.

Adeudos con proveedores: createDebt, updateDebt, softDeleteDebt, getSupplierBalances() (saldo por proveedor = adeudos − abonos vigentes) y getSupplierStatement(supplierId) (estado de cuenta: adeudos y abonos en orden cronológico con saldo corrido). Un abono nunca puede ser mayor al saldo pendiente del adeudo; validarlo en servidor dentro de una transacción. No se puede borrar un adeudo que tiene abonos vigentes.

Alta de proveedor con saldo inicial: el formulario de proveedor tiene una sección opcional 'Ya le debo' con monto y fecha 'al día'; si se llena, crea un SupplierDebt de tipo OPENING_BALANCE en la misma transacción.

Página /proveedores (listado con búsqueda, alta y edición) y /proveedores/[id] con el estado de cuenta, botón 'Nuevo adeudo' y botón 'Registrar abono'; accesibles para el mostrador, que ve el saldo de cada proveedor. Borrar pagos y adeudos sigue canDelete: el mostrador solo lo que capturó hoy. Los códigos PROV-0001, ADE-0001 y PAG-0001 se muestran en toda la interfaz y se pueden buscar.

Página /pagos: selector rápido de rango (Hoy, Esta Semana, Este Mes, Personalizado) que persiste en la URL como search params, para que el filtro sobreviva a recargar y sea compartible.

Cuatro tarjetas KPI arriba: Total Pagado, Total por pagar (saldo de todos los adeudos abiertos), Proveedor con mayor monto, Cantidad de pagos. Las tarjetas solo se muestran al dueño (canViewTotals). El mostrador ve la lista de pagos con sus montos, pero no totales del periodo.

Tabla analítica con desglose por categoría y por proveedor, ordenable por columna, con paginación de 50 registros.

Modal de captura con selector de proveedor que permite crear uno nuevo en línea si no existe; al elegir un proveedor con adeudos abiertos, ofrece abonar a uno de ellos (preseleccionado el más antiguo) mostrando su saldo, o registrarlo como pago de contado. Selector de categoría desde el catálogo (por defecto la del adeudo), monto con máscara de moneda y método de pago. El campo de monto nunca acepta texto.

Todo con estados de carga, estado vacío con mensaje útil, y confirmación antes de eliminar. Diseño responsivo: en celular la tabla se convierte en tarjetas apiladas."
```

Qué verificar: captura tres pagos de distintos días y confirma que el filtro "Esta Semana" los suma correctamente. Elimina uno y confirma que desaparece de la vista pero sigue en la base con `deletedAt`. Da de alta un proveedor con saldo inicial de $50,000, abónale $20,000 y confirma que su estado de cuenta muestra $30,000 pendientes; intenta abonar $40,000 y confirma que la app lo impide.

## Fase 5 — Checklist y recordatorios

```
claude "Construye el módulo de recordatorios en /src/modules/reminders.

Server Actions: createReminder, updateReminder, toggleCompleted, softDeleteReminder, getRemindersByBucket(). La clasificación en Hoy, Mañana, Atrasados y Completados se calcula en servidor con los helpers de zona horaria, nunca en el cliente.

Página /recordatorios con pestañas: 'Para Mañana' activa por defecto, 'Para Hoy', 'Atrasados' y 'Completados'. Cada pestaña muestra un contador en su etiqueta. La pestaña Atrasados se marca en rojo cuando tiene elementos.

Cada ítem es una tarjeta con checkbox, nombre del cliente en negrita, dos tags distintivos para folio y teléfono, hora límite, nota técnica y marca de prioridad si es ALTA. El teléfono es un enlace que abre WhatsApp.

El checkbox usa useOptimistic para marcarse al instante y revertirse si la acción falla. Al completar se guarda completedAt y completedById.

Modal de captura con búsqueda de cliente existente por nombre, folio o teléfono; si no existe, se crea en línea. Selector de fecha con atajos 'Hoy' y 'Mañana'.

Diseño pensado para celular primero: el personal del taller lo va a usar en el teléfono, con tarjetas grandes y checkbox de al menos 44 píxeles."
```

Qué verificar: marca un pendiente como completado y confirma que la vista no recarga. Crea uno con fecha de ayer y confirma que aparece en Atrasados.

Dos detalles que valen más de lo que parecen: el contador en cada pestaña y el teléfono como enlace a WhatsApp. Eso convierte la lista en la herramienta que realmente abren en la mañana.

## Fase 6 — Panel de administración

El panel es lo que hace que el sistema crezca sin que tengas que volver a pedir código. Todo lo que hoy sería un cambio de código debe poder cambiarse aquí.

```
claude "Construye /admin, accesible solo para rol OWNER, con navegación lateral y estas secciones:

/admin/catalogos — CRUD de categorías (los proveedores ya se administran en /proveedores, abierto al mostrador). Crear, editar, reordenar y desactivar; desactivar proveedores sí queda aquí. Una categoría en uso no se puede borrar, solo desactivar; la app lo explica con un mensaje claro en vez de fallar.

/admin/clientes — listado de clientes con búsqueda, historial de pedidos por cliente y total pagado asociado. Fusionar duplicados cuando el mismo cliente quedó capturado dos veces.

/admin/usuarios — alta, baja y cambio de rol. Resetear contraseña. No permitir desactivar al último OWNER. El alta de usuarios pasa por la API de administración de Better Auth, ya que el registro público está deshabilitado.

/admin/auditoria — tabla de AuditLog con filtros por usuario, entidad y rango de fechas, mostrando el diff legible de cada cambio. Paginada.

/admin/configuracion — editor de AppSetting para valores que hoy estarían escritos en el código: nombre del negocio, moneda por defecto, método de pago por defecto, cuántos días atrás considerar en Atrasados, si mostrar o no cada módulo.

/admin/papelera — registros con deletedAt, con opción de restaurar.

Usa un layout compartido para todas, con un componente de tabla administrativa reutilizable que reciba columnas y acciones por configuración, para que agregar una sección nueva sea cuestión de minutos."
```

Qué verificar: desactiva una categoría y confirma que deja de aparecer en el modal de captura, pero los pagos históricos que la usaban siguen mostrándola.

La papelera y la auditoría son las dos que te van a salvar el día que alguien borre algo por error.

## Fase 7 — Reportes, exportación y búsqueda

```
claude "Agrega tres capacidades transversales:

1. Búsqueda global accesible con Cmd+K y desde un ícono en el encabezado. Busca clientes por nombre, folio o teléfono, y pagos por concepto o proveedor. Resultados agrupados por tipo, con navegación por teclado. Es la función que convierte el sistema en algo consultable.

2. Exportación a CSV y Excel desde /pagos y /recordatorios, respetando los filtros activos. Incluye encabezados en español y formato de fecha legible. El archivo se genera en servidor con exceljs, no con xlsx: ese paquete está sin mantenimiento en npm.

3. Dashboard en la raíz / con el estado del día: pendientes para hoy, pendientes para mañana, atrasados, total pagado del mes y gráfica de gasto por categoría del mes en curso con Recharts. Para rol STAFF oculta los montos y muestra solo los pendientes.

Agrega también una vista /clientes/[id] con el historial completo de un cliente: sus pedidos pasados y los pagos a proveedores vinculados a esos pedidos."
```

Qué verificar: busca un folio y confirma que llega al cliente en menos de dos segundos. Exporta un mes de pagos y ábrelo en Excel.

La vista por cliente es la que abre la puerta a todo lo demás: cuando tengas ahí el costo y el precio de venta, tienes margen por pieza sin haber cambiado el esquema.

## Fase 8 — Deploy en VPS, respaldos y operación

Sin esta fase tienes un proyecto bonito en tu computadora, no un sistema.

```
claude "Prepara el proyecto para producción en un VPS con Docker:

1. Dockerfile multi-stage para la app (Node 24, output standalone de Next.js, usuario no root). Al arrancar el contenedor corre prisma migrate deploy antes de iniciar el servidor.

2. docker-compose.prod.yml con tres servicios: app, db (postgres:17-alpine con volumen persistente) y caddy (reverse proxy con HTTPS automático para el dominio en la variable APP_DOMAIN). Postgres SIN puertos publicados: solo accesible por la red interna de Docker. Variables desde un .env.production que no se versiona; documenta cada una en .env.example.

3. Servicio de respaldo: pg_dump diario en formato custom (-Fc) con fecha en el nombre, retención de 14 días en el VPS, y un script para copiar los respaldos fuera del VPS (rclone a Google Drive). Agrega también npm run backup para generar un respaldo manual.

4. Script de restauración (pg_restore) y documentación paso a paso en el README, incluyendo cómo probar la restauración en local contra el Postgres de docker-compose.yml.

5. Ruta /api/health que verifique conexión a la base y devuelva estado; úsala como healthcheck del contenedor app.

6. Página de error global y una de 404 en español, con un enlace de regreso al inicio.

7. Validación de variables de entorno al arranque con Zod: si falta DATABASE_URL, BETTER_AUTH_SECRET o BETTER_AUTH_URL, la app falla con un mensaje claro en vez de romperse a medias.

8. Pruebas con Vitest para los helpers de zona horaria y los cálculos de agregación de pagos. Son las dos cosas donde un error pasa desapercibido.

9. Documenta en el README: primer deploy en el VPS, cómo actualizar (git pull + docker compose up -d --build), cómo crear el primer usuario OWNER en una base vacía, y el procedimiento de respaldo y restauración."
```

Rutina mínima una vez en producción: verificar cada semana que el respaldo del día llegó a Drive, probar una restauración en local una vez al mes, y revisar la auditoría cuando un total no cuadre. Un respaldo que no has probado restaurar no cuenta como respaldo.

## Fase 9 — Ganchos para crecer después

No construyas nada de esto ahora. Está aquí para que las fases 1 a 6 no lo bloqueen. Si el esquema y la estructura por módulos quedaron como se describe arriba, cada uno de estos es un módulo nuevo, no una reescritura.

| Extensión | Qué habilita | Lo que ya quedó listo |
| --- | --- | --- |
| Inventario de piezas | Control de existencias y costo por pieza | Estructura `/src/modules`, catálogos administrables |
| Ventas y margen | Precio de venta contra costo real | `orderId` en SupplierPayment, vista por cliente |
| Aviso por WhatsApp | Notificar al cliente que su pieza está lista | Teléfono en Client, `AppSetting` para la plantilla |
| Segunda sucursal | Separar operación por tienda | Agregar `branchId` a los modelos y filtrar por él |
| App para taller | Vista reducida solo de pendientes | Roles ya separados; falta un rol WORKSHOP |
| Sincronía con Sheets | Respaldo visible para los dueños | Server Actions aisladas; se cuelga un webhook sin tocar la UI |
| Reportes para contador | Entregas mensuales automáticas | Exportación ya construida en Fase 7 |

Sobre la sincronía con Google Sheets del plan original: déjala para el final, y solo si alguien la pide. Con un panel de administración y exportación a Excel, casi siempre deja de hacer falta.

## Cómo trabajar estas fases

Una fase por sesión, y no avances hasta que la verificación de esa fase pase. La causa más común de que un proyecto así se enrede es pedir tres fases en el mismo mensaje.

- [x] Fase 0 — Infraestructura
- [x] Fase 1 — Modelo de datos
- [x] Fase 2 — Autenticación y roles
- [x] Fase 3 — Capa de datos y zona horaria
- [x] Fase 4 — Módulo de pagos
- [x] Fase 5 — Checklist
- [x] Fase 6 — Panel de administración
- [ ] Fase 7 — Reportes y búsqueda
- [ ] Fase 8 — Deploy y respaldos

Tres reglas que ahorran mucho trabajo:

1. **Haz commit al terminar cada fase.** Si la siguiente sale mal, regresas en un comando en vez de reconstruir.
2. **Pide siempre `prisma migrate dev`, nunca `db push`.** La diferencia es tener historial de cambios del esquema o no tenerlo.
3. **Usa la app tú mismo al cerrar cada fase**, capturando datos reales de un día. Los problemas de este tipo de sistema aparecen al usarlo, no al revisarlo.

Lo que no conviene delegar: las decisiones de la segunda sección y qué se considera un dato obligatorio. Si eso queda ambiguo, Claude Code elige por ti y el esquema termina con campos que nadie llena.

Primer mensaje de tu siguiente sesión: el bloque de la Fase 0, tal cual está escrito arriba.
