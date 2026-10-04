"use server";

import { z } from "zod";
import { defineAction } from "@/lib/action";
import { recordAudit, withAudit } from "@/lib/audit";
import { BusinessError } from "@/lib/errors";
import { toNameKey } from "@/lib/normalize";
import type { Prisma } from "@/generated/prisma/client";
import { supplierSchema, updateSupplierSchema } from "../schemas";

const REVALIDATE = ["/proveedores", "/pagos"];

async function assertSupplierCategory(tx: Prisma.TransactionClient, categoryId: string | null) {
  if (!categoryId) return;
  const category = await tx.category.findFirst({ where: { id: categoryId, type: "SUPPLIER", isActive: true } });
  if (!category) throw new BusinessError("Esa categoría de proveedor no existe o está desactivada.");
}

/** Alta de proveedor. Con "Ya le debo" crea también su adeudo de saldo inicial. */
export const createSupplier = defineAction(
  { role: "STAFF", schema: supplierSchema, revalidate: REVALIDATE },
  async ({ openingBalance, ...data }, { user }) => {
    const supplier = await withAudit({ userId: user.id, action: "CREATE", entity: "Supplier" }, async (tx) => {
      await assertSupplierCategory(tx, data.categoryId);
      const created = await tx.supplier.create({ data: { ...data, nameKey: toNameKey(data.name) } });

      if (openingBalance) {
        const debt = await tx.supplierDebt.create({
          data: {
            supplierId: created.id,
            kind: "OPENING_BALANCE",
            date: openingBalance.date,
            description: openingBalance.description ?? "Saldo pendiente al dar de alta al proveedor",
            amount: openingBalance.amount,
            createdById: user.id,
          },
        });
        await recordAudit(tx, { userId: user.id, action: "CREATE", entity: "SupplierDebt", after: debt });
      }
      return created;
    });
    return { id: supplier.id, code: supplier.code, name: supplier.name };
  },
);

export const updateSupplier = defineAction(
  { role: "STAFF", schema: updateSupplierSchema, revalidate: REVALIDATE },
  async ({ id, ...data }, { user }) => {
    const supplier = await withAudit(
      {
        userId: user.id,
        action: "UPDATE",
        entity: "Supplier",
        before: (tx) => tx.supplier.findUnique({ where: { id } }),
      },
      async (tx) => {
        await assertSupplierCategory(tx, data.categoryId);
        return tx.supplier.update({ where: { id }, data: { ...data, nameKey: toNameKey(data.name) } });
      },
    );
    return { id: supplier.id, code: supplier.code, name: supplier.name };
  },
);

/** Activar/desactivar: solo el dueño. Un proveedor desactivado no aparece al capturar. */
export const setSupplierActive = defineAction(
  { role: "OWNER", schema: z.object({ id: z.string().min(1), isActive: z.boolean() }), revalidate: REVALIDATE },
  async ({ id, isActive }, { user }) => {
    await withAudit(
      { userId: user.id, action: "UPDATE", entity: "Supplier", before: (tx) => tx.supplier.findUnique({ where: { id } }) },
      (tx) => tx.supplier.update({ where: { id }, data: { isActive } }),
    );
  },
);
