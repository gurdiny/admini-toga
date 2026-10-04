# Plan de Desarrollo por Fases — Sistema de Joyería

Oct 3, 2026 · @GERA URIAS

## Qué faltaba en el plan original

El plan v1.0 resuelve bien la captura y los reportes, pero deja fuera doce cosas que después cuestan rehacer. Todas están incorporadas en las fases de abajo.

| Hueco | Por qué importa | Fase |
| --- | --- | --- |
| Proveedor y cliente son texto libre | "Juan", "JUAN" y "Juan Pérez" cuentan como tres proveedores distintos; el Top Proveedor sale mal | 1 |
| No hay usuarios ni roles | Sin esto el panel de administración no tiene sobre qué pararse | 2 |
| No hay auditoría | Nadie sabe quién editó o borró un pago, ni cuándo | 1 y 2 |
| Borrado físico de registros | Un pago borrado por error no se recupera | 1 |
| Pedido y pago están desconectados | No puedes saber cuánto costó una pieza ni su margen | 1 |
| `status` sin definir | En joyería hay anticipo, saldo y liquidado; falta modelarlo | 1 |
| Categorías escritas en el código | Cada categoría nueva exige un deploy | 1 y 6 |
| Zona horaria sin resolver | "Hoy" calculado en UTC clasifica mal todo pedido capturado después de las 18:00 en CDMX | 3 |
| Sin respaldos de la base | Si se pierde la base, se pierde todo | 8 |
| Sin hosting definido | El plan nunca dice dónde vive la app | 0 y 8 |
| Sin búsqueda | Buscar el folio #JOY-8492 de hace tres meses no tiene cómo hacerse | 7 |
| Sin exportación | El contador va a pedir Excel | 7 |

## Decisiones antes de escribir código

Define estas cinco cosas tú, no Claude Code. Si las deja abiertas, improvisa y después hay que deshacer.

| Decisión | Recomendación | Por qué |
| --- | --- | --- |
| Hosting | Vercel, plan gratuito | Deploy desde Git, sin servidor que administrar |
| Base de datos | Neon o Supabase, plan gratuito | PostgreSQL administrado con respaldo automático; el gratuito aguanta años a tu volumen |
| Autenticación | Auth.js (NextAuth) con credenciales | Dos usuarios, sin costo, sin proveedor externo |
| Dominio | Opcional al inicio | El subdominio de Vercel funciona; un dominio cuesta \~$200 MXN al año |
| Moneda | MXN, con campo de moneda desde el día uno | Si algún día compras oro en USD, el esquema ya lo soporta |

Costo real esperado: $0 al mes mientras sean dos usuarios. Si algún día necesitas plan pago de base de datos, son unos $19 USD mensuales.

Una regla que conviene fijar desde ahora: todas las fechas se guardan en UTC y se muestran en `America/Mexico_City`. Nunca se guarda una fecha ya convertida.

## Fase 0 — Infraestructura y repositorio

Antes de cualquier pantalla. Si esto queda mal, todo lo demás se arrastra.

```
claude "Crea un proyecto Next.js 15 con App Router, TypeScript estricto, Tailwind CSS v4, Shadcn UI, Lucide React y Prisma con PostgreSQL. Estructura las carpetas por dominio, no por tipo de archivo: /src/modules/payments, /src/modules/reminders, /src/modules/admin, cada uno con sus propios actions, components y schemas; /src/lib para utilidades compartidas; /src/components/ui solo para Shadcn. Configura .env.example con DATABASE_URL, AUTH_SECRET y APP_TIMEZONE=America/Mexico_City. Agrega Zod, date-fns y date-fns-tz. Inicializa git con un .gitignore que excluya .env y /prisma/*.db. Usa prisma migrate dev para todo cambio de esquema, nunca db push. Crea un README con los comandos de arranque."
```

Qué verificar antes de seguir: `npm run dev` levanta sin errores, `npx prisma migrate dev` corre limpio, y la carpeta `/src/modules` existe con las tres subcarpetas vacías.

La estructura por módulos es lo que hace escalable el proyecto. Agregar inventario mañana será crear `/src/modules/inventory` sin tocar nada más.

## Fase 1 — Modelo de datos completo

La fase más importante. Cambiar el esquema con datos reales adentro es caro; vale la pena modelarlo entero aunque al inicio no uses todo.

```
claude "Diseña el esquema Prisma completo con estos modelos:

User: id, email único, passwordHash, name, role (enum OWNER|STAFF), isActive, createdAt.

Supplier: id, name único, category (relación), phone, notes, isActive, createdAt. Reemplaza el supplierName de texto libre.

Category: id, name único, type (enum SUPPLIER|PAYMENT), color, sortOrder, isActive. Catálogo administrable, no enum fijo.

Client: id, name, phone, folio único opcional, notes, createdAt. Un cliente tiene muchos OrderReminder.

SupplierPayment: id, date, supplierId, categoryId, concept, amount Decimal(12,2), currency (default MXN), exchangeRate Decimal(10,4) opcional, paymentMethod (enum EFECTIVO|TRANSFERENCIA|TARJETA|CHEQUE), status (enum ANTICIPO|LIQUIDADO|PENDIENTE), orderId opcional, createdById, deletedAt opcional, createdAt, updatedAt.

OrderReminder: id, clientId, targetDate Date, targetTime String opcional, note Text, isCompleted, completedAt opcional, completedById opcional, priority (enum NORMAL|ALTA), deletedAt opcional, createdById, createdAt, updatedAt.

AuditLog: id, userId, action (enum CREATE|UPDATE|DELETE), entity String, entityId String, changes Json, createdAt. Índice en [entity, entityId] y en createdAt.

AppSetting: id, key único, value Json. Para configuración editable desde el panel sin deploy.

Índices: SupplierPayment en [date, supplierId] y [deletedAt]; OrderReminder en [targetDate, isCompleted] y [clientId]; Client en [phone] y [folio].

Todo borrado es lógico mediante deletedAt; nunca uses delete físico. Crea un seed con 2 usuarios, 8 categorías típicas de joyería, 5 proveedores y 10 registros de ejemplo."
```

Qué verificar: la migración corre, el seed llena la base, y `npx prisma studio` muestra las relaciones conectadas.

Los campos que hoy parecen de más — `orderId` en el pago, `currency`, `AppSetting`, `priority` — son exactamente los que evitan rehacer el esquema dentro de un año.

## Fase 2 — Autenticación y roles

Dos roles bastan: dueño y empleado. El empleado captura; el dueño además ve totales, edita catálogos y revisa la auditoría.

```
claude "Implementa autenticación con Auth.js v5 usando proveedor de credenciales contra el modelo User, con bcrypt para el hash. Crea /login con formulario simple y manejo de error visible. Agrega middleware que proteja todas las rutas excepto /login. Define un helper requireRole(role) para Server Actions que lance error si el usuario no tiene permiso, y un helper getCurrentUser() para leer la sesión en servidor. El rol OWNER accede a todo; STAFF accede a pagos y recordatorios pero no a /admin ni a los totales del dashboard. Crea un wrapper withAudit() que envuelva toda Server Action de escritura y registre automáticamente en AuditLog el usuario, la acción, la entidad y el diff de cambios. La sesión dura 30 días para no pedir contraseña cada día en el mostrador."
```

Qué verificar: entrar como STAFF y confirmar que `/admin` redirige, y que al crear un pago aparece un renglón nuevo en `AuditLog`.

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

Página /pagos: selector rápido de rango (Hoy, Esta Semana, Este Mes, Personalizado) que persiste en la URL como search params, para que el filtro sobreviva a recargar y sea compartible.

Tres tarjetas KPI arriba: Total Pagado, Proveedor con mayor monto, Cantidad de pagos. Las tarjetas solo se muestran al rol OWNER.

Tabla analítica con desglose por categoría y por proveedor, ordenable por columna, con paginación de 50 registros.

Modal de captura con selector de proveedor que permite crear uno nuevo en línea si no existe, selector de categoría desde el catálogo, monto con máscara de moneda, método de pago y estado. El campo de monto nunca acepta texto.

Todo con estados de carga, estado vacío con mensaje útil, y confirmación antes de eliminar. Diseño responsivo: en celular la tabla se convierte en tarjetas apiladas."
```

Qué verificar: captura tres pagos de distintos días y confirma que el filtro "Esta Semana" los suma correctamente. Elimina uno y confirma que desaparece de la vista pero sigue en la base con `deletedAt`.

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

/admin/catalogos — CRUD de categorías y proveedores. Crear, editar, reordenar y desactivar. Una categoría en uso no se puede borrar, solo desactivar; la app lo explica con un mensaje claro en vez de fallar.

/admin/clientes — listado de clientes con búsqueda, historial de pedidos por cliente y total pagado asociado. Fusionar duplicados cuando el mismo cliente quedó capturado dos veces.

/admin/usuarios — alta, baja y cambio de rol. Resetear contraseña. No permitir desactivar al último OWNER.

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

2. Exportación a CSV y Excel desde /pagos y /recordatorios, respetando los filtros activos. Incluye encabezados en español y formato de fecha legible. El archivo se genera en servidor con la librería xlsx.

3. Dashboard en la raíz / con el estado del día: pendientes para hoy, pendientes para mañana, atrasados, total pagado del mes y gráfica de gasto por categoría del mes en curso con Recharts. Para rol STAFF oculta los montos y muestra solo los pendientes.

Agrega también una vista /clientes/[id] con el historial completo de un cliente: sus pedidos pasados y los pagos a proveedores vinculados a esos pedidos."
```

Qué verificar: busca un folio y confirma que llega al cliente en menos de dos segundos. Exporta un mes de pagos y ábrelo en Excel.

La vista por cliente es la que abre la puerta a todo lo demás: cuando tengas ahí el costo y el precio de venta, tienes margen por pieza sin haber cambiado el esquema.

## Fase 8 — Deploy, respaldos y operación

Sin esta fase tienes un proyecto bonito en tu computadora, no un sistema.

```
claude "Prepara el proyecto para producción:

1. Configura el deploy en Vercel conectado al repositorio de Git, con las variables de entorno documentadas y separación entre base de datos de desarrollo y de producción.

2. Agrega un script npm run backup que exporte toda la base a JSON con fecha en el nombre, y documenta en el README cómo correrlo y dónde guardar el archivo.

3. Agrega una ruta /api/health que verifique conexión a la base y devuelva estado.

4. Configura una página de error global y una de 404 en español, con un enlace de regreso al inicio.

5. Agrega validación de variables de entorno al arranque con Zod: si falta DATABASE_URL o AUTH_SECRET, la app falla con un mensaje claro en vez de romperse a medias.

6. Escribe pruebas con Vitest para los helpers de zona horaria y los cálculos de agregación de pagos. Son las dos cosas donde un error pasa desapercibido.

7. Documenta en el README el procedimiento de respaldo, el de restauración y cómo crear el primer usuario OWNER en una base vacía."
```

Rutina mínima una vez en producción: respaldo semanal descargado a una carpeta de Drive, y revisar la auditoría cuando un total no cuadre. Neon y Supabase ya hacen respaldo automático, pero un respaldo que no has probado restaurar no cuenta como respaldo.

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

- [ ] Fase 0 — Infraestructura
- [ ] Fase 1 — Modelo de datos
- [ ] Fase 2 — Autenticación y roles
- [ ] Fase 3 — Capa de datos y zona horaria
- [ ] Fase 4 — Módulo de pagos
- [ ] Fase 5 — Checklist
- [ ] Fase 6 — Panel de administración
- [ ] Fase 7 — Reportes y búsqueda
- [ ] Fase 8 — Deploy y respaldos

Tres reglas que ahorran mucho trabajo:

1. **Haz commit al terminar cada fase.** Si la siguiente sale mal, regresas en un comando en vez de reconstruir.
2. **Pide siempre `prisma migrate dev`, nunca `db push`.** La diferencia es tener historial de cambios del esquema o no tenerlo.
3. **Usa la app tú mismo al cerrar cada fase**, capturando datos reales de un día. Los problemas de este tipo de sistema aparecen al usarlo, no al revisarlo.

Lo que no conviene delegar: las decisiones de la segunda sección y qué se considera un dato obligatorio. Si eso queda ambiguo, Claude Code elige por ti y el esquema termina con campos que nadie llena.

Primer mensaje de tu siguiente sesión: el bloque de la Fase 0, tal cual está escrito arriba.
