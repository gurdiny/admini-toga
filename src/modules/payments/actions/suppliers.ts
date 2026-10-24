"use server";

import { z } from "zod";
import { defineAction } from "@/lib/action";
import { recordAudit, withAudit } from "@/lib/audit";
import { toNameKey } from "@/lib/normalize";
import { plural } from "@/lib/text";
import { formatCode } from "@/lib/codes";
import { BusinessError } from "@/lib/errors";
import { deleteSchema, supplierSchema, updateSupplierSchema } from "../schemas";

const REVALIDATE = ["/proveedores", "/pagos", "/admin/catalogos"];

/** Alta de proveedor. Con "Ya le debo" crea también su adeudo de saldo inicial. */
export const createSupplier = defineAction(
  { role: "STAFF", schema: supplierSchema, revalidate: REVALIDATE },
  async ({ openingBalance, ...data }, { user }) => {
    const supplier = await withAudit({ userId: user.id, action: "CREATE", entity: "Supplier" }, async (tx) => {
      const nameKey = toNameKey(data.name);
      // Un proveedor borrado conserva su nombre: hay que restaurarlo, no
      // chocar contra el índice único con un mensaje que no dice qué hacer.
      const trashed = await tx.supplier.findFirst({
        where: { nameKey, deletedAt: { not: null } },
        select: { code: true },
      });
      if (trashed) {
        throw new BusinessError(
          `Ya hubo un proveedor con ese nombre (${formatCode("supplier", trashed.code)}) y está en la papelera. Restáuralo desde Admin → Papelera.`,
        );
      }
      const created = await tx.supplier.create({ data: { ...data, nameKey } });

      if (openingBalance) {
        const debt = await tx.supplierDebt.create({
          data: {
            supplierId: created.id,
            kind: "OPENING_BALANCE",
            date: openingBalance.date,
            description: openingBalance.description ?? "Saldo pendiente al dar de alta al proveedor",
            amount: openingBalance.amount,
            amountMetal: openingBalance.amountMetal,
            amountLabor: openingBalance.amountLabor,
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

/**
 * Borra un proveedor con todo lo suyo: sus notas y sus pagos se van a la
 * papelera para que dejen de contar en los totales. Primero los pagos y
 * después las notas, porque un adeudo con abonos vigentes no se puede
 * marcar (trigger ADEUDO_CON_ABONOS). Solo el dueño, y con la casilla
 * marcada si el proveedor tiene movimientos.
 */
export const softDeleteSupplier = defineAction(
  { role: "OWNER", schema: deleteSchema, revalidate: REVALIDATE },
  async ({ id, confirm }, { user }) => {
    await withAudit(
      { userId: user.id, action: "DELETE", entity: "Supplier", before: (tx) => tx.supplier.findUnique({ where: { id } }) },
      async (tx) => {
        const supplier = await tx.supplier.findFirst({ where: { id, deletedAt: null } });
        if (!supplier) throw new BusinessError("El proveedor ya no existe. Recarga la página.");

        const [payments, debts] = await Promise.all([
          tx.supplierPayment.findMany({ where: { supplierId: id, deletedAt: null } }),
          tx.supplierDebt.findMany({ where: { supplierId: id, deletedAt: null } }),
        ]);
        if ((payments.length || debts.length) && !confirm) {
          throw new BusinessError(
            `${supplier.name} tiene ${plural(debts.length, "adeudo", "adeudos")} y ${plural(payments.length, "pago", "pagos")}. Marca la casilla para borrarlo con todo lo suyo.`,
          );
        }

        const now = new Date();
        for (const payment of payments) {
          const after = await tx.supplierPayment.update({ where: { id: payment.id }, data: { deletedAt: now } });
          await recordAudit(tx, { userId: user.id, action: "DELETE", entity: "SupplierPayment", before: payment, after });
        }
        for (const debt of debts) {
          const after = await tx.supplierDebt.update({ where: { id: debt.id }, data: { deletedAt: now } });
          await recordAudit(tx, { userId: user.id, action: "DELETE", entity: "SupplierDebt", before: debt, after });
        }
        return tx.supplier.update({ where: { id }, data: { deletedAt: now } });
      },
    );
  },
);
