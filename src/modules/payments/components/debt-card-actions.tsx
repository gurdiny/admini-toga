"use client";

import { useState } from "react";
import { HandCoins } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RowMenu } from "@/components/row-menu";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { formatCode } from "@/lib/codes";
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
            <Button size="sm" className="h-10">
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
          debt={debt}
        />
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`¿Borrar el adeudo ${code}?`}
        description={
          Number(debt.paid) > 0
            ? "Este adeudo tiene abonos. Primero borra sus abonos; si no, no se podrá borrar."
            : `${debt.description}. Dejará de contar en lo que le debes al proveedor.`
        }
        pending={remove.pending}
        onConfirm={() => remove.run({ id: debt.id })}
      />
    </div>
  );
}
