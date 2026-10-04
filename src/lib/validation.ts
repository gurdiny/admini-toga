// Piezas de Zod compartidas por los esquemas de los módulos.
// Normalizan lo que se captura a mano (espacios, mayúsculas, "$1,250.50",
// teléfonos con guiones) para que la base reciba siempre el mismo formato.

import { z } from "zod";
import { addDays, dayToDb, getToday, isDayKey, type DayKey } from "@/lib/date";
import { parseMoney } from "@/lib/money";
import { cleanName, normalizeFolio, normalizePhoneMX } from "@/lib/normalize";

// Mensajes genéricos de Zod en español.
z.config(z.locales.es());

const MAX_FUTURE_DAYS = 365;

/** Texto obligatorio, sin espacios sobrantes. */
/** "El concepto" → "Falta el concepto." (sirve para cualquier género). */
const missing = (label: string) => `Falta ${label.charAt(0).toLowerCase()}${label.slice(1)}.`;

/** Texto obligatorio, sin espacios sobrantes. `label` con artículo: "La nota". */
export const zText = (label: string, max = 200) =>
  z
    .string({ error: missing(label) })
    .transform(cleanName)
    .pipe(
      z
        .string()
        .min(1, missing(label))
        .max(max, `${label} no puede pasar de ${max} caracteres.`),
    );

/** Texto opcional: vacío o solo espacios → null. */
export const zOptionalText = (max = 1000) =>
  z
    .string()
    .nullish()
    .transform((value) => (value?.trim() ? value.trim() : null))
    .pipe(z.string().max(max, `No puede pasar de ${max} caracteres.`).nullable());

/** Monto positivo con máximo 2 decimales. Acepta "1,250.50" o 1250.5. Sale como texto "1250.50". */
export const zMoney = z
  .union([z.string(), z.number()], { error: "Escribe un monto." })
  .transform((value, ctx) => {
    const amount = parseMoney(String(value));
    if (!amount) {
      ctx.addIssue({ code: "custom", message: "Escribe un monto válido, por ejemplo 1250.50." });
      return z.NEVER;
    }
    if (amount.lte(0)) {
      ctx.addIssue({ code: "custom", message: "El monto debe ser mayor a cero." });
      return z.NEVER;
    }
    if (amount.gte("10000000000")) {
      ctx.addIssue({ code: "custom", message: "El monto es demasiado grande." });
      return z.NEVER;
    }
    return amount.toFixed(2);
  });

/**
 * Día calendario "yyyy-MM-dd", no más de un año en el futuro.
 * Sale como Date listo para una columna @db.Date (medianoche UTC de ese día),
 * para que nadie pase el texto directo a Prisma: Prisma acepta strings en
 * campos DateTime y TypeScript no lo detectaría.
 */
export const zDay = z
  .string({ error: "Elige una fecha." })
  .refine(isDayKey, "La fecha no es válida.")
  .refine((day) => day >= "2000-01-01", "La fecha es demasiado antigua.")
  .refine(
    (day) => day <= addDays(getToday(), MAX_FUTURE_DAYS),
    "La fecha no puede ser de más de un año en el futuro.",
  )
  .transform((day) => dayToDb(day as DayKey));

export const zOptionalDay = z
  .union([z.literal(""), z.null(), zDay])
  .optional()
  .transform((value) => (value ? value : null));

/** Hora "HH:mm" opcional (hora de México). */
export const zOptionalTime = z
  .string()
  .nullish()
  .transform((value) => (value?.trim() ? value.trim() : null))
  .refine((value) => value === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(value), "Hora no válida, usa formato 24 h, por ejemplo 17:30.");

/** Teléfono de México opcional; se guarda con 10 dígitos. */
export const zOptionalPhone = z
  .string()
  .nullish()
  .transform((value, ctx) => {
    if (!value?.trim()) return null;
    const phone = normalizePhoneMX(value);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "El teléfono debe tener 10 dígitos." });
      return z.NEVER;
    }
    return phone;
  });

/** Folio opcional, en mayúsculas y sin espacios: "joy-8492" → "JOY-8492". */
export const zOptionalFolio = z
  .string()
  .nullish()
  .transform((value) => normalizeFolio(value))
  .refine((value) => value === null || value.length <= 30, "El folio no puede pasar de 30 caracteres.");

export const zOptionalEmail = z
  .string()
  .nullish()
  .transform((value) => (value?.trim() ? value.trim().toLowerCase() : null))
  .pipe(z.email("Escribe un correo válido.").nullable());

/** Id interno (cuid) de un registro relacionado. */
export const zId = (label = "El registro") =>
  z.string({ error: missing(label) }).min(1, missing(label));

export const zOptionalId = z
  .string()
  .nullish()
  .transform((value) => (value ? value : null));

/** Checkbox de formulario: "on", "true", true → true. */
export const zCheckbox = z
  .union([z.boolean(), z.string(), z.null()])
  .optional()
  .transform((value) => value === true || value === "on" || value === "true");

export const CURRENCIES = ["MXN", "USD"] as const;
export const zCurrency = z.enum(CURRENCIES, { error: "Moneda no válida." }).default("MXN");
