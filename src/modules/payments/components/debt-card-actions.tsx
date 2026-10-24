"use client";

import { useState } from "react";
import { HandCoins } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RowMenu } from "@/components/row-menu";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { formatCode } from "@/lib/codes";
import { formatMoney } from "@/lib/money";
import { plural } from "@/lib/text";
import type { PaymentMethod } from "@/generated/prisma/browser";
import { softDeleteDebt } from "../actions/debts";
import type { CaptureOptions, DebtSummary } from "../queries";
import { DebtFormDialog } from "./debt-form-dialog";
import { PaymentFormDialog } from "./payment-form-dialog";

type Props = {
  debt: DebtSummary;
  supplierId: string;
  supplierName: string;
  options: CaptureOptions;
  defaultMethod: PaymentMethod;
  canEdit: boolean;
  canDelete: boolean;
};

export function DebtCardActions({ debt, supplierId, supplierName, options, defaultMethod, canEdit, canDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const code = formatCode("debt", debt.code);
  const abonos = debt.payments.length;
  const remove = useAction(softDeleteDebt, { success: `Adeudo ${code} borrado.`, onSuccess: () => setDeleting(false) });

  return (
    <div className="flex items-center gap-1">
      {!debt.isSettled && (
        <PaymentFormDialog
          options={options}
          defaultMethod={defaultMethod}
          preset={{ supplierId, debtId: debt.id }}
          title={`Abonar a ${code}`}
          trigger={
            <Button variant="brand">
              <HandCoins aria-hidden />
              Abonar
            </Button>
          }
        />
      )}
      <RowMenu
        label={code}
        onEdit={canEdit ? () => setEditing(true) : undefined}
        onDelete={canDelete ? () => setDeleting(true) : undefined}
      />
      {canEdit && (
        <DebtFormDialog
          open={editing}
          onOpenChange={setEditing}
          supplierId={supplierId}
          supplierName={supplierName}
          categories={options.paymentCategories}
          defaultCurrency={options.defaults.currency}
          debt={{ ...debt, amountMetal: debt.amounts.metal, amountLabor: debt.amounts.labor }}
        />
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`¿Borrar el adeudo ${code}?`}
        description={
          <>
            {debt.description}. Dejará de contar en lo que le debes al proveedor.
            {abonos > 0 && (
              <>
                {" "}
                Tiene <strong>{plural(abonos, "abono", "abonos")}</strong> por{" "}
                {formatMoney(debt.paid.total, debt.currency)}, que se borran junto con él.
              </>
            )}{" "}
            Todo se puede restaurar desde la papelera.
          </>
        }
        requireCheck={abonos > 0 ? `Sí, borra el adeudo ${code} y sus ${plural(abonos, "abono", "abonos")}.` : null}
        pending={remove.pending}
        onConfirm={(confirmed) => remove.run({ id: debt.id, confirm: confirmed })}
      />
    </div>
  );
}
