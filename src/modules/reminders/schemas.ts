import { z } from "zod";
import { Priority } from "@/generated/prisma/browser";
import {
  zDay,
  zId,
  zOptionalFolio,
  zOptionalId,
  zOptionalPhone,
  zOptionalText,
  zOptionalTime,
  zText,
} from "@/lib/validation";

/**
 * Cliente: el nombre es obligatorio y además necesita al menos un dato para
 * identificarlo (teléfono o folio). Dos "María López" sin más datos serían
 * imposibles de distinguir.
 */
export const clientSchema = z
  .object({
    name: zText("El nombre del cliente", 120),
    phone: zOptionalPhone,
    folio: zOptionalFolio,
    notes: zOptionalText(),
  })
  .refine((data) => data.phone !== null || data.folio !== null, {
    path: ["phone"],
    message: "Escribe el teléfono o el folio del cliente.",
  });

export const reminderSchema = z
  .object({
    /** Cliente existente… */
    clientId: zOptionalId,
    /** …o uno nuevo capturado en el mismo modal. */
    newClient: clientSchema.nullish().transform((value) => value ?? null),
    targetDate: zDay,
    targetTime: zOptionalTime,
    note: zText("La nota", 2000),
    priority: z.enum(Priority).default("NORMAL"),
  })
  .refine((data) => (data.clientId === null) !== (data.newClient === null), {
    path: ["clientId"],
    message: "Elige un cliente o captura uno nuevo.",
  });

export const toggleReminderSchema = z.object({
  id: zId("El recordatorio"),
  completed: z.boolean(),
});

export type ClientInput = z.input<typeof clientSchema>;
export type ReminderInput = z.input<typeof reminderSchema>;
