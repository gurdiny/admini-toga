"use server";

import { z } from "zod";
import { defineAction } from "@/lib/action";
import { withAudit } from "@/lib/audit";
import { canDelete, canEdit, DELETE_DENIED_MESSAGE, EDIT_DENIED_MESSAGE } from "@/lib/auth/permissions";
import { formatCode } from "@/lib/codes";
import { BusinessError } from "@/lib/errors";
import { zId } from "@/lib/validation";
import type { Prisma } from "@/generated/prisma/client";
import { getSupplierDebts } from "../queries";
import { debtSchema, idSchema } from "../schemas";

const REVALIDATE = ["/proveedores", "/pagos"];

async function assertCanCapture(tx: Prisma.TransactionClient, supplierId: string, categoryId: string | null) {
  const supplier = await tx.supplier.findUnique({ where: { id: supplierId }, select: { isActive: true } });
  if (!supplier) throw new BusinessError("El proveedor no existe.");
  if (!supplier.isActive) throw new BusinessError("El proveedor está desactivado.");
  if (categoryId) {
    const category = await tx.category.findFirst({ where: { id: categoryId, type: "PAYMENT", isActive: true } });
    if (!category) throw new BusinessError("Esa categoría no existe o está desactivada.");
  }
}

async function findDebtOrFail(tx: Prisma.TransactionClient, id: string) {
  const debt = await tx.supplierDebt.findFirst({ where: { id, deletedAt: null } });
  if (!debt) throw new BusinessError("El adeudo ya no existe. Recarga la página.");
  return debt;
}

export const createDebt = defineAction(
  { role: "STAFF", schema: debtSchema, revalidate: REVALIDATE },
  async (data, { user }) => {
    const debt = await withAudit({ userId: user.id, action: "CREATE", entity: "SupplierDebt" }, async (tx) => {
      await assertCanCapture(tx, data.supplierId, data.categoryId);
      return tx.supplierDebt.create({ data: { ...data, createdById: user.id } });
    });
    return { id: debt.id, code: debt.code };
  },
);

export const updateDebt = defineAction(
  { role: "STAFF", schema: z.intersection(debtSchema, z.object({ id: zId("El adeudo") })), revalidate: REVALIDATE },
  // El proveedor no se cambia: sus abonos están amarrados a él.
  async ({ id, supplierId: _ignored, ...data }, { user }) => {
    await withAudit(
      { userId: user.id, action: "UPDATE", entity: "SupplierDebt", before: (tx) => tx.supplierDebt.findUnique({ where: { id } }) },
      async (tx) => {
        const debt = await findDebtOrFail(tx, id);
        if (!canEdit(user, debt)) throw new BusinessError(EDIT_DENIED_MESSAGE);
        await assertCanCapture(tx, debt.supplierId, data.categoryId);
        // Bajar el monto por debajo de lo abonado lo impide la base (MONTO_MENOR_A_ABONADO).
        return tx.supplierDebt.update({ where: { id }, data });
      },
    );
  },
);

export const softDeleteDebt = defineAction(
  { role: "STAFF", schema: idSchema, revalidate: REVALIDATE },
  async ({ id }, { user }) => {
    await withAudit(
      { userId: user.id, action: "DELETE", entity: "SupplierDebt", before: (tx) => tx.supplierDebt.findUnique({ where: { id } }) },
      async (tx) => {
        const debt = await findDebtOrFail(tx, id);
        if (!canDelete(user, debt)) throw new BusinessError(DELETE_DENIED_MESSAGE);
        const abonos = await tx.supplierPayment.count({ where: { debtId: id, deletedAt: null } });
        if (abonos > 0) {
          throw new BusinessError(
            `El adeudo ${formatCode("debt", debt.code)} tiene ${abonos} abono(s). Bórralos primero.`,
          );
        }
        return tx.supplierDebt.update({ where: { id }, data: { deletedAt: new Date() } });
      },
    );
  },
);

/**
 * Adeudos abiertos de un proveedor para el formulario de abono.
 * `includeId`: al editar un abono, incluye su adeudo aunque ya esté liquidado.
 */
export const loadDebtsForPayment = defineAction(
  {
    role: "STAFF",
    schema: z.object({ supplierId: zId("El proveedor"), includeId: z.string().nullish() }),
  },
  async ({ supplierId, includeId }) => {
    const debts = await getSupplierDebts(supplierId);
    return debts.filter((debt) => !debt.isSettled || debt.id === includeId);
  },
);
