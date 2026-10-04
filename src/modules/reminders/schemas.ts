import { z } from "zod";
import { Priority } from "@/generated/prisma/browser";
import { dayToDb, getToday } from "@/lib/date";
import {
  zDay,
  zId,
  zOptionalId,
  zOptionalPhone,
  zOptionalText,
  zOptionalTime,
  zText,
} from "@/lib/validation";

/**
 * Cliente nuevo capturado en línea. El folio (CLI-0001) lo asigna la base,
 * así nunca se repite; el teléfono es opcional pero conviene para WhatsApp.
 */
export const clientSchema = z.object({
  name: zText("El nombre del cliente", 120),
  phone: zOptionalPhone,
  notes: zOptionalText(),
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

/**
 * Un recordatorio nunca se programa antes de hoy (día de México). Al editar
 * uno atrasado se permite dejar la fecha que ya tenía, para poder corregir la
 * nota sin moverlo. Devuelve el mensaje de error o null.
 */
export function reminderDayError(targetDate: Date, previous?: Date | null, now: Date = new Date()): string | null {
  if (targetDate >= dayToDb(getToday(now))) return null;
  if (previous && targetDate.getTime() === previous.getTime()) return null;
  return "La fecha no puede ser anterior a hoy.";
}

/** Solo fecha y hora: lo que el mostrador puede mover en cualquier pedido pendiente. */
export const rescheduleSchema = z.object({
  id: zId("El recordatorio"),
  targetDate: zDay,
  targetTime: zOptionalTime,
});

export const reminderIdSchema = z.object({ id: zId("El recordatorio") });

export const clientSearchSchema = z.object({
  q: z.string().max(80).default(""),
});
