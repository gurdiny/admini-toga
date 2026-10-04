"use server";

import { z } from "zod";
import { defineAction } from "@/lib/action";
import { recordAudit, withAudit } from "@/lib/audit";
import {
  canDelete,
  canEdit,
  canReschedule,
  DELETE_DENIED_MESSAGE,
  EDIT_DENIED_MESSAGE,
  RESCHEDULE_DENIED_MESSAGE,
} from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { toNameKey } from "@/lib/normalize";
import { zId } from "@/lib/validation";
import type { Prisma } from "@/generated/prisma/client";
import { findClients } from "../queries";
import { clientSearchSchema, reminderDayError, reminderIdSchema, reminderSchema, rescheduleSchema, toggleReminderSchema } from "../schemas";

const REVALIDATE = ["/recordatorios", "/clientes"];

type ReminderData = z.output<typeof reminderSchema>;

/**
 * Devuelve el id del cliente: el elegido (si sigue vigente) o el nuevo, que
 * se da de alta en la misma transacción y queda en la auditoría.
 */
async function resolveClient(tx: Prisma.TransactionClient, data: ReminderData, userId: string): Promise<string> {
  if (data.clientId) {
    const client = await tx.client.findFirst({ where: { id: data.clientId, deletedAt: null }, select: { id: true } });
    if (!client) throw new BusinessError("Ese cliente ya no existe. Búscalo de nuevo.");
    return client.id;
  }

  const newClient = data.newClient!;
  const client = await tx.client.create({
    data: { ...newClient, nameKey: toNameKey(newClient.name) },
  });
  await recordAudit(tx, { userId, action: "CREATE", entity: "Client", after: client });
  return client.id;
}

/** Error de campo como los de Zod, para que el formulario lo muestre junto a la fecha. */
function assertReminderDay(targetDate: Date, previous?: Date) {
  const message = reminderDayError(targetDate, previous);
  if (message) throw new z.ZodError([{ code: "custom", path: ["targetDate"], message, input: targetDate }]);
}

function reminderFields(data: ReminderData, clientId: string) {
  return {
    clientId,
    targetDate: data.targetDate,
    targetTime: data.targetTime,
    note: data.note,
    priority: data.priority,
  };
}

export const createReminder = defineAction(
  { role: "STAFF", schema: reminderSchema, revalidate: REVALIDATE },
  async (data, { user }) => {
    assertReminderDay(data.targetDate);
    const reminder = await withAudit({ userId: user.id, action: "CREATE", entity: "OrderReminder" }, async (tx) => {
      const clientId = await resolveClient(tx, data, user.id);
      return tx.orderReminder.create({
        data: { ...reminderFields(data, clientId), createdById: user.id },
        include: { client: { select: { code: true } } },
      });
    });
    return { id: reminder.id, clientCode: reminder.client.code, newClient: data.newClient !== null };
  },
);

export const updateReminder = defineAction(
  {
    role: "STAFF",
    schema: z.intersection(reminderSchema, z.object({ id: zId("El recordatorio") })),
    revalidate: REVALIDATE,
  },
  async ({ id, ...data }, { user }) => {
    await withAudit(
      { userId: user.id, action: "UPDATE", entity: "OrderReminder", before: (tx) => tx.orderReminder.findUnique({ where: { id } }) },
      async (tx) => {
        const current = await tx.orderReminder.findFirst({ where: { id, deletedAt: null } });
        if (!current) throw new BusinessError("El recordatorio ya no existe. Recarga la página.");
        if (!canEdit(user, current)) throw new BusinessError(EDIT_DENIED_MESSAGE);
        assertReminderDay(data.targetDate, current.targetDate);
        const clientId = await resolveClient(tx, data, user.id);
        return tx.orderReminder.update({ where: { id }, data: reminderFields(data, clientId) });
      },
    );
  },
);

/**
 * Cambiar solo la fecha y la hora (el cliente pidió moverlo). A diferencia de
 * `updateReminder`, lo puede hacer el mostrador aunque el pedido sea de otro
 * día o de otro usuario (`canReschedule`); no toca cliente, nota ni prioridad.
 */
export const rescheduleReminder = defineAction(
  { role: "STAFF", schema: rescheduleSchema, revalidate: REVALIDATE },
  async ({ id, targetDate, targetTime }, { user }) => {
    await withAudit(
      { userId: user.id, action: "UPDATE", entity: "OrderReminder", before: (tx) => tx.orderReminder.findUnique({ where: { id } }) },
      async (tx) => {
        const current = await tx.orderReminder.findFirst({ where: { id, deletedAt: null } });
        if (!current) throw new BusinessError("El recordatorio ya no existe. Recarga la página.");
        if (!canReschedule(user, current)) throw new BusinessError(RESCHEDULE_DENIED_MESSAGE);
        assertReminderDay(targetDate, current.targetDate);
        return tx.orderReminder.update({ where: { id }, data: { targetDate, targetTime } });
      },
    );
  },
);

/**
 * Marcar o desmarcar como completado. Lo puede hacer cualquiera que capture
 * (el taller completa pedidos que capturó el mostrador). Es idempotente: si ya
 * está en ese estado no cambia nada (doble toque en el celular).
 */
export const toggleCompleted = defineAction(
  { role: "STAFF", schema: toggleReminderSchema, revalidate: REVALIDATE },
  async ({ id, completed }, { user }) => {
    const current = await db.orderReminder.findFirst({ where: { id, deletedAt: null }, select: { isCompleted: true } });
    if (!current) throw new BusinessError("El recordatorio ya no existe. Recarga la página.");
    if (current.isCompleted === completed) return { completed };

    await withAudit(
      { userId: user.id, action: "UPDATE", entity: "OrderReminder", before: (tx) => tx.orderReminder.findUnique({ where: { id } }) },
      (tx) =>
        tx.orderReminder.update({
          where: { id, deletedAt: null },
          data: completed
            ? { isCompleted: true, completedAt: new Date(), completedById: user.id }
            : { isCompleted: false, completedAt: null, completedById: null },
        }),
    );
    return { completed };
  },
);

export const softDeleteReminder = defineAction(
  { role: "STAFF", schema: reminderIdSchema, revalidate: REVALIDATE },
  async ({ id }, { user }) => {
    await withAudit(
      { userId: user.id, action: "DELETE", entity: "OrderReminder", before: (tx) => tx.orderReminder.findUnique({ where: { id } }) },
      async (tx) => {
        const reminder = await tx.orderReminder.findFirst({ where: { id, deletedAt: null } });
        if (!reminder) throw new BusinessError("El recordatorio ya no existe. Recarga la página.");
        if (!canDelete(user, reminder)) throw new BusinessError(DELETE_DENIED_MESSAGE);
        return tx.orderReminder.update({ where: { id }, data: { deletedAt: new Date() } });
      },
    );
  },
);

/** Buscador de clientes del formulario de captura. Solo lectura. */
export const searchClients = defineAction({ role: "STAFF", schema: clientSearchSchema }, async ({ q }) => findClients(q));

