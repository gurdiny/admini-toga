"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RowMenu } from "@/components/row-menu";
import { useAction } from "@/hooks/use-action";
import { formatCode } from "@/lib/codes";
import { formatMoney } from "@/lib/money";
import type { PaymentMethod } from "@/generated/prisma/browser";
import { softDeletePayment } from "../actions/payments";
import type { CaptureOptions } from "../queries";
import { PaymentFormDialog, type PaymentFormValues } from "./payment-form-dialog";

type Props = {
  payment: PaymentFormValues & { code: number };
  options: CaptureOptions;
  defaultMethod: PaymentMethod;
  canEdit: boolean;
  canDelete: boolean;
};

/** Editar / borrar un pago, según permisos calculados en el servidor. */
export function PaymentRowActions({ payment, options, defaultMethod, canEdit, canDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const code = formatCode("payment", payment.code);
  const remove = useAction(softDeletePayment, {
    success: `Pago ${code} borrado. El dueño puede restaurarlo desde la papelera.`,
    onSuccess: () => setDeleting(false),
  });

  return (
    <>
      <RowMenu
        label={code}
        onEdit={canEdit ? () => setEditing(true) : undefined}
        onDelete={canDelete ? () => setDeleting(true) : undefined}
      />
      {canEdit && (
        <PaymentFormDialog
          open={editing}
          onOpenChange={setEditing}
          options={options}
          defaultMethod={defaultMethod}
          payment={payment}
          title={`Editar ${code}`}
        />
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`¿Borrar el pago ${code}?`}
        description={
          <>
            {payment.concept} por <strong>{formatMoney(payment.amount, payment.currency)}</strong>.
            {payment.debtId && " El saldo del adeudo vuelve a subir por ese monto."}
          </>
        }
        pending={remove.pending}
        onConfirm={() => remove.run({ id: payment.id })}
      />
    </>
  );
}
