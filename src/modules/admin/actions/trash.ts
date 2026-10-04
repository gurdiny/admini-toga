"use server";

import { defineAction } from "@/lib/action";
import { withAudit } from "@/lib/audit";
import { formatCode } from "@/lib/codes";
import { BusinessError } from "@/lib/errors";
import { restoreSchema } from "../schemas";

const REVALIDATE = ["/admin/papelera", "/pagos", "/proveedores", "/recordatorios"];
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
    } else {
      await withAudit(
        { userId: user.id, action: "RESTORE", entity: "OrderReminder", before: (tx) => tx.orderReminder.findUnique({ where: { id } }) },
        async (tx) => {
          const reminder = await tx.orderReminder.findFirst({ where: { id, deletedAt: { not: null } } });
          if (!reminder) throw new BusinessError(GONE);
          return tx.orderReminder.update({ where: { id }, data: { deletedAt: null } });
        },
      );
    }
  },
);
