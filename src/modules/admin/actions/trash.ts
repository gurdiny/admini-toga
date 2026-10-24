"use server";

import { defineAction } from "@/lib/action";
import { recordAudit, withAudit } from "@/lib/audit";
import { formatCode } from "@/lib/codes";
import { BusinessError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";
import { restoreSchema } from "../schemas";

/** Lo mínimo que esta acción necesita de un modelo con borrado lógico. */
type SoftDeletable = {
  findMany(args: { where: Record<string, unknown> }): Promise<{ id: string }[]>;
  update(args: { where: { id: string }; data: { deletedAt: null } }): Promise<{ id: string }>;
};

/**
 * Devuelve lo que se fue a la papelera en el mismo instante que su dueño (un
 * borrado en cascada marca todo con la misma hora) y deja en paz lo que ya
 * estaba borrado desde antes. Un renglón de auditoría por registro.
 */
async function restoreSameMoment(
  userId: string,
  entity: "SupplierDebt" | "SupplierPayment" | "OrderReminder",
  model: SoftDeletable,
  where: Record<string, unknown>,
  tx: Prisma.TransactionClient,
) {
  const rows = await model.findMany({ where });
  for (const row of rows) {
    const after = await model.update({ where: { id: row.id }, data: { deletedAt: null } });
    await recordAudit(tx, { userId, action: "RESTORE", entity, before: row, after });
  }
}

const REVALIDATE = ["/admin/papelera", "/pagos", "/proveedores", "/recordatorios", "/clientes"];
const GONE = "Ya no está en la papelera. Recarga la página.";

/**
 * Saca un registro de la papelera (deletedAt = null). Un abono solo vuelve si
 * su adeudo está vigente y le alcanza el saldo; la base lo vuelve a revisar
 * con sus triggers, esto es para dar un mensaje claro.
 */
export const restoreRecord = defineAction(
  { role: "OWNER", schema: restoreSchema, revalidate: REVALIDATE },
  async ({ type, id }, { user }) => {
    if (type === "pagos") {
      await withAudit(
        { userId: user.id, action: "RESTORE", entity: "SupplierPayment", before: (tx) => tx.supplierPayment.findUnique({ where: { id } }) },
        async (tx) => {
          const payment = await tx.supplierPayment.findFirst({ where: { id, deletedAt: { not: null } }, include: { debt: true } });
          if (!payment) throw new BusinessError(GONE);
          if (payment.debt?.deletedAt) {
            throw new BusinessError(`Este abono es del adeudo ${formatCode("debt", payment.debt.code)}, que también está en la papelera. Restaura primero el adeudo.`);
          }
          return tx.supplierPayment.update({ where: { id }, data: { deletedAt: null } });
        },
      );
    } else if (type === "adeudos") {
      await withAudit(
        { userId: user.id, action: "RESTORE", entity: "SupplierDebt", before: (tx) => tx.supplierDebt.findUnique({ where: { id } }) },
        async (tx) => {
          const debt = await tx.supplierDebt.findFirst({ where: { id, deletedAt: { not: null } } });
          if (!debt) throw new BusinessError(GONE);
          return tx.supplierDebt.update({ where: { id }, data: { deletedAt: null } });
        },
      );
    } else if (type === "recordatorios") {
      await withAudit(
        { userId: user.id, action: "RESTORE", entity: "OrderReminder", before: (tx) => tx.orderReminder.findUnique({ where: { id } }) },
        async (tx) => {
          const reminder = await tx.orderReminder.findFirst({ where: { id, deletedAt: { not: null } } });
          if (!reminder) throw new BusinessError(GONE);
          const client = await tx.client.findUnique({ where: { id: reminder.clientId }, select: { deletedAt: true, name: true } });
          if (client?.deletedAt) {
            throw new BusinessError(`Este pedido es de ${client.name}, que también está en la papelera. Restaura primero al cliente.`);
          }
          return tx.orderReminder.update({ where: { id }, data: { deletedAt: null } });
        },
      );
    } else if (type === "proveedores") {
      await withAudit(
        { userId: user.id, action: "RESTORE", entity: "Supplier", before: (tx) => tx.supplier.findUnique({ where: { id } }) },
        async (tx) => {
          const supplier = await tx.supplier.findFirst({ where: { id, deletedAt: { not: null } } });
          if (!supplier) throw new BusinessError(GONE);
          // Vuelve con lo que se borró en el mismo momento que él: sus notas
          // y sus pagos. Lo que ya estaba borrado antes se queda borrado.
          // Primero las notas: un abono necesita su adeudo vigente (trigger).
          const gone = { supplierId: id, deletedAt: supplier.deletedAt };
          await restoreSameMoment(user.id, "SupplierDebt", tx.supplierDebt, gone, tx);
          await restoreSameMoment(user.id, "SupplierPayment", tx.supplierPayment, gone, tx);
          return tx.supplier.update({ where: { id }, data: { deletedAt: null } });
        },
      );
    } else {
      await withAudit(
        { userId: user.id, action: "RESTORE", entity: "Client", before: (tx) => tx.client.findUnique({ where: { id } }) },
        async (tx) => {
          const client = await tx.client.findFirst({ where: { id, deletedAt: { not: null } } });
          if (!client) throw new BusinessError(GONE);
          await restoreSameMoment(user.id, "OrderReminder", tx.orderReminder, { clientId: id, deletedAt: client.deletedAt }, tx);
          return tx.client.update({ where: { id }, data: { deletedAt: null } });
        },
      );
    }
  },
);
