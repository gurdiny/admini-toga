// Traduce cualquier error a un mensaje en español para el usuario.
// Los errores esperados (validación, permisos, reglas de negocio, reglas de
// la base) dan un mensaje concreto; los inesperados se registran en el
// servidor y el usuario ve un mensaje genérico.

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { fail, type Result } from "@/lib/result";

/** Error de negocio esperado: su mensaje se muestra tal cual al usuario. */
export class BusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessError";
  }
}

/** Sin sesión o sin el rol requerido (lo lanza requireRole). */
export class AuthorizationError extends Error {
  constructor(message = "No tienes permiso para hacer esto.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Mensajes para las llaves únicas, por nombre del índice en Postgres. */
const UNIQUE_MESSAGES: Record<string, string> = {
  suppliers_nameKey_key: "Ya existe un proveedor con ese nombre.",
  categories_type_nameKey_key: "Ya existe una categoría con ese nombre.",
  clients_folio_key: "Ese folio ya está registrado con otro cliente.",
  users_email_key: "Ya existe un usuario con ese correo.",
  app_settings_key_key: "Esa configuración ya existe.",
};

/** Mensajes de los triggers y CHECK de la base (ver migración debt_balance_guard). */
function checkViolationMessage(dbMessage: string): string {
  const debt = dbMessage.match(/ADE-\d+/)?.[0];
  const ref = debt ? ` ${debt}` : "";
  if (dbMessage.startsWith("ABONO_EXCEDE_SALDO")) {
    return `El abono es mayor que el saldo pendiente del adeudo${ref}.`;
  }
  if (dbMessage.startsWith("MONEDA_DISTINTA")) {
    return `El abono debe estar en la misma moneda que el adeudo${ref}.`;
  }
  if (dbMessage.startsWith("ADEUDO_ELIMINADO")) {
    return `El adeudo${ref} está eliminado; restáuralo antes de abonarle.`;
  }
  if (dbMessage.startsWith("ADEUDO_CON_ABONOS")) {
    return `El adeudo${ref} ya tiene abonos. Elimina primero los abonos.`;
  }
  if (dbMessage.startsWith("MONTO_MENOR_A_ABONADO")) {
    return `El monto del adeudo${ref} no puede ser menor a lo que ya se abonó.`;
  }
  if (dbMessage.includes("_amount_positive")) {
    return "El monto debe ser mayor a cero.";
  }
  return "Los datos no cumplen una regla del sistema.";
}

type DriverCause = { originalCode?: string; originalMessage?: string; constraint?: { index?: string } };

function driverCause(error: Prisma.PrismaClientKnownRequestError): DriverCause {
  const meta = error.meta as { driverAdapterError?: { cause?: DriverCause } } | undefined;
  return meta?.driverAdapterError?.cause ?? {};
}

/** Errores de campos de Zod como { "campo": "mensaje" }. */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    fields[key] ??= issue.message;
  }
  return fields;
}

export function toFailure(error: unknown): Result<never> {
  if (error instanceof z.ZodError) {
    return fail("Revisa los datos marcados.", zodFieldErrors(error));
  }
  if (error instanceof BusinessError || error instanceof AuthorizationError) {
    return fail(error.message);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const cause = driverCause(error);
    if (error.code === "P2002") {
      return fail(UNIQUE_MESSAGES[cause.constraint?.index ?? ""] ?? "Ese registro ya existe.");
    }
    if (cause.originalCode === "23514") {
      return fail(checkViolationMessage(cause.originalMessage ?? ""));
    }
    if (error.code === "P2003") {
      return fail("Uno de los datos relacionados no existe o está en uso.");
    }
    if (error.code === "P2025") {
      return fail("El registro ya no existe. Recarga la página.");
    }
  }
  console.error("[action] error inesperado:", error);
  return fail("Ocurrió un error inesperado. Intenta de nuevo.");
}
