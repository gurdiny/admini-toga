"use server";

import { z } from "zod";
import { defineAction } from "@/lib/action";
import { withAudit } from "@/lib/audit";
import { canDelete, canEdit, DELETE_DENIED_MESSAGE, EDIT_DENIED_MESSAGE } from "@/lib/auth/permissions";
import { formatCode } from "@/lib/codes";
import { BusinessError } from "@/lib/errors";
import { formatMoney, toDecimal, ZERO } from "@/lib/money";
import type { Prisma } from "@/generated/prisma/client";
import { CHARGE_LABELS } from "../charges";
import { idSchema, paymentSchema, updatePaymentSchema } from "../schemas";

const REVALIDATE = ["/pagos", "/proveedores", "/clientes"];

type PaymentData = z.output<typeof paymentSchema>;

/**
 * Reglas que no expresa el esquema. Corren dentro de la transacción.
 * El abono > saldo también lo impide la base (trigger); aquí se valida antes
 * para dar un mensaje con el saldo disponible.
 */
async function validatePayment(tx: Prisma.TransactionClient, data: PaymentData, editingId?: string) {
  const [supplier, category] = await Promise.all([
    tx.supplier.findUnique({ where: { id: data.supplierId }, select: { isActive: true } }),
    tx.category.findFirst({ where: { id: data.categoryId, type: "PAYMENT" }, select: { isActive: true } }),
  ]);
  if (!supplier) throw new BusinessError("El proveedor no existe.");
  if (!supplier.isActive && !editingId) throw new BusinessError("El proveedor está desactivado.");
  if (!category) throw new BusinessError("La categoría no existe.");
  if (!category.isActive && !editingId) throw new BusinessError("La categoría está desactivada.");
  if (data.orderId) {
    const order = await tx.orderReminder.findFirst({ where: { id: data.orderId, deletedAt: null }, select: { id: true } });
    if (!order) throw new BusinessError("Ese pedido ya no existe. Quítalo del pago o recarga la página.");
  }

  if (!data.debtId) return;
  const debt = await tx.supplierDebt.findFirst({
    where: { id: data.debtId, supplierId: data.supplierId, deletedAt: null },
  });
  if (!debt) throw new BusinessError("Ese adeudo no es de este proveedor o ya no existe.");
  const ref = formatCode("debt", debt.code);
  if (debt.currency !== data.currency) {
    throw new BusinessError(`El adeudo ${ref} está en ${debt.currency}; el abono debe ser en la misma moneda.`);
  }

  // Cada renglón se compara por su cuenta: el metal no paga hechura ni al revés.
  const paid = await tx.supplierPayment.aggregate({
    where: { debtId: debt.id, deletedAt: null, ...(editingId && { id: { not: editingId } }) },
    _sum: { amountMetal: true, amountLabor: true },
  });
  const rows = [
    {
      label: CHARGE_LABELS.metal.toLowerCase(),
      owed: debt.amountMetal.sub(paid._sum.amountMetal ?? ZERO),
      paying: toDecimal(data.amountMetal),
    },
    {
      label: CHARGE_LABELS.labor.toLowerCase(),
      owed: debt.amountLabor.sub(paid._sum.amountLabor ?? ZERO),
      paying: toDecimal(data.amountLabor),
    },
  ];
  for (const row of rows) {
    if (row.paying.lte(0) || row.paying.lte(row.owed)) continue;
    throw new BusinessError(
      row.owed.lte(0)
        ? `El renglón de ${row.label} de ${ref} ya está liquidado.`
        : `El abono de ${row.label} es mayor que su saldo en ${ref}: quedan ${formatMoney(row.owed, debt.currency)}.`,
    );
  }
}

function normalize(data: PaymentData) {
  return { ...data, exchangeRate: data.currency === "MXN" ? null : data.exchangeRate };
}

export const createPayment = defineAction(
  { role: "STAFF", schema: paymentSchema, revalidate: REVALIDATE },
  async (data, { user }) => {
    const payment = await withAudit({ userId: user.id, action: "CREATE", entity: "SupplierPayment" }, async (tx) => {
      await validatePayment(tx, data);
      return tx.supplierPayment.create({ data: { ...normalize(data), createdById: user.id } });
    });
    return { id: payment.id, code: payment.code };
  },
);

export const updatePayment = defineAction(
  { role: "STAFF", schema: updatePaymentSchema, revalidate: REVALIDATE },
  async ({ id, ...data }, { user }) => {
    await withAudit(
      { userId: user.id, action: "UPDATE", entity: "SupplierPayment", before: (tx) => tx.supplierPayment.findUnique({ where: { id } }) },
      async (tx) => {
        const current = await tx.supplierPayment.findFirst({ where: { id, deletedAt: null } });
        if (!current) throw new BusinessError("El pago ya no existe. Recarga la página.");
        if (!canEdit(user, current)) throw new BusinessError(EDIT_DENIED_MESSAGE);
        await validatePayment(tx, data, id);
        return tx.supplierPayment.update({ where: { id }, data: normalize(data) });
      },
    );
  },
);

export const softDeletePayment = defineAction(
  { role: "STAFF", schema: idSchema, revalidate: REVALIDATE },
  async ({ id }, { user }) => {
    await withAudit(
      { userId: user.id, action: "DELETE", entity: "SupplierPayment", before: (tx) => tx.supplierPayment.findUnique({ where: { id } }) },
      async (tx) => {
        const payment = await tx.supplierPayment.findFirst({ where: { id, deletedAt: null } });
        if (!payment) throw new BusinessError("El pago ya no existe. Recarga la página.");
        if (!canDelete(user, payment)) throw new BusinessError(DELETE_DENIED_MESSAGE);
        return tx.supplierPayment.update({ where: { id }, data: { deletedAt: new Date() } });
      },
    );
  },
);
