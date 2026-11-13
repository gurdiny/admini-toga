"use server";

// Pagos sin proveedor: no tocan saldos ni notas, así que no hay más reglas
// que las de siempre (rol, esquema, quién puede editar/borrar y auditoría).

import { defineAction } from "@/lib/action";
import { withAudit } from "@/lib/audit";
import { canDelete, canEdit, DELETE_DENIED_MESSAGE, EDIT_DENIED_MESSAGE } from "@/lib/auth/permissions";
import { BusinessError } from "@/lib/errors";
import { idSchema, otherPaymentSchema, updateOtherPaymentSchema } from "../schemas";

const REVALIDATE = ["/pagos"];
const GONE = "El pago ya no existe. Recarga la página.";

export const createOtherPayment = defineAction(
  { role: "STAFF", schema: otherPaymentSchema, revalidate: REVALIDATE },
  async (data, { user }) => {
    const payment = await withAudit({ userId: user.id, action: "CREATE", entity: "OtherPayment" }, (tx) =>
      tx.otherPayment.create({ data: { ...data, currency: "MXN", createdById: user.id } }),
    );
    return { id: payment.id, code: payment.code };
  },
);

export const updateOtherPayment = defineAction(
  { role: "STAFF", schema: updateOtherPaymentSchema, revalidate: REVALIDATE },
  async ({ id, ...data }, { user }) => {
    await withAudit(
      { userId: user.id, action: "UPDATE", entity: "OtherPayment", before: (tx) => tx.otherPayment.findUnique({ where: { id } }) },
      async (tx) => {
        const current = await tx.otherPayment.findFirst({ where: { id, deletedAt: null } });
        if (!current) throw new BusinessError(GONE);
        if (!canEdit(user, current)) throw new BusinessError(EDIT_DENIED_MESSAGE);
        return tx.otherPayment.update({ where: { id }, data });
      },
    );
  },
);

export const softDeleteOtherPayment = defineAction(
  { role: "STAFF", schema: idSchema, revalidate: REVALIDATE },
  async ({ id }, { user }) => {
    await withAudit(
      { userId: user.id, action: "DELETE", entity: "OtherPayment", before: (tx) => tx.otherPayment.findUnique({ where: { id } }) },
      async (tx) => {
        const payment = await tx.otherPayment.findFirst({ where: { id, deletedAt: null } });
        if (!payment) throw new BusinessError(GONE);
        if (!canDelete(user, payment)) throw new BusinessError(DELETE_DENIED_MESSAGE);
        return tx.otherPayment.update({ where: { id }, data: { deletedAt: new Date() } });
      },
    );
  },
);
