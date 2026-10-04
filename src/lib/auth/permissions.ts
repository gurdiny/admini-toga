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

/** Mensaje cuando canDelete() es false, para el usuario. */
export const DELETE_DENIED_MESSAGE =
  "Solo puedes borrar lo que capturaste hoy. Pide al dueño que lo borre.";
