// Quién puede hacer qué. Única fuente de verdad: las páginas, los menús y las
// Server Actions consultan estas funciones en vez de comparar roles sueltos.
//
// Idea del negocio: el MOSTRADOR (STAFF) hace la captura diaria para quitarle
// carga al dueño: pagos, abonos, adeudos, proveedores, clientes y
// recordatorios. El DUEÑO (OWNER) puede todo eso y además ve los totales
// generales y administra (catálogos, usuarios, auditoría, papelera, ajustes).

import type { Role } from "@/generated/prisma/browser";
import { dayInTZ, getToday } from "@/lib/date";

type Actor = { id: string; role: Role };

const isOwner = (user: Actor) => user.role === "OWNER";

/**
 * Totales generales: total pagado del periodo, total por pagar, proveedor con
 * mayor monto, gráficas y reportes. El mostrador SÍ ve montos individuales y
 * el saldo de cada proveedor (los necesita para abonar), pero no los totales.
 */
export const canViewTotals = isOwner;

/** /admin: categorías, usuarios, auditoría, papelera, configuración, fusionar clientes. */
export const canAdminister = isOwner;

/** Capturar y editar pagos, abonos, adeudos, proveedores, clientes y recordatorios. */
export const canCapture = (user: Actor) => user.role === "OWNER" || user.role === "STAFF";

/**
 * Mandar a la papelera un pago, adeudo o recordatorio.
 * El dueño puede siempre. El mostrador solo lo que él mismo capturó hoy
 * (día de México), para corregir un error al momento.
 */
export function canDelete(
  user: Actor,
  record: { createdById: string; createdAt: Date },
  now: Date = new Date(),
): boolean {
  if (isOwner(user)) return true;
  return record.createdById === user.id && dayInTZ(record.createdAt) === getToday(now);
}

/**
 * Editar un pago, adeudo o recordatorio ya capturado: misma regla que borrar.
 * Así el mostrador corrige sus errores del día, pero no reescribe el historial.
 * (Proveedores y clientes sí los edita cualquiera: no son movimientos de dinero.)
 */
export const canEdit = canDelete;

/**
 * Cambiar solo la fecha y la hora de un pedido (recordatorio) pendiente,
 * aunque lo haya capturado otro o en otro día: el cliente pide moverlo y el
 * mostrador lo atiende sin esperar al dueño. El cliente, el texto del pedido
 * y la prioridad siguen la regla de `canEdit`. Un pedido completado no se
 * reprograma (primero se regresa a pendientes).
 */
export const canReschedule = (user: Actor, reminder: { isCompleted: boolean }) =>
  canCapture(user) && !reminder.isCompleted;

export const DELETE_DENIED_MESSAGE =
  "Solo puedes borrar lo que capturaste hoy. Pide al dueño que lo borre.";
export const RESCHEDULE_DENIED_MESSAGE =
  "Este pedido ya está completado. Regrésalo a pendientes para cambiar su fecha.";
export const EDIT_DENIED_MESSAGE =
  "Solo puedes corregir lo que capturaste hoy. Pide al dueño que lo cambie.";
