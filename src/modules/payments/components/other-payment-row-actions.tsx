"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RowMenu } from "@/components/row-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAction } from "@/hooks/use-action";
import { formatCode } from "@/lib/codes";
import { formatDay, type DayKey } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { softDeleteOtherPayment } from "../actions/other-payments";
import type { PaymentTrace } from "../queries";
import { OtherPaymentFormDialog, type OtherPaymentFormValues } from "./other-payment-form-dialog";

type Props = {
  payment: OtherPaymentFormValues & { code: number; currency: string };
  trace: PaymentTrace;
  canEdit: boolean;
  canDelete: boolean;
};

/** Ver detalle (todos), editar y borrar (según permisos calculados en el servidor). */
export function OtherPaymentRowActions({ payment, trace, canEdit, canDelete }: Props) {
  const [viewing, setViewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const code = formatCode("otherPayment", payment.code);
  const remove = useAction(softDeleteOtherPayment, {
    success: `Pago ${code} borrado. El dueño puede restaurarlo desde la papelera.`,
    onSuccess: () => setDeleting(false),
  });

  return (
    <>
      <RowMenu
        label={code}
        onView={() => setViewing(true)}
        onEdit={canEdit ? () => setEditing(true) : undefined}
        onDelete={canDelete ? () => setDeleting(true) : undefined}
      />

      <Dialog open={viewing} onOpenChange={setViewing}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Pago {code}</DialogTitle>
            <DialogDescription>Sin proveedor</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xl font-bold tabular-nums">{formatMoney(payment.amount, payment.currency)}</span>
            <Badge variant="outline">Sin proveedor</Badge>
          </div>
          <dl className="divide-y rounded-2xl border text-sm">
            <Row label="Nota">
              <span className="whitespace-pre-line">{payment.note}</span>
            </Row>
            <Row label="Día y hora">
              <span className="block first-letter:uppercase">
                {formatDay(payment.date as DayKey, "EEEE d 'de' MMMM yyyy")}, {payment.time}
              </span>
            </Row>
            <Row label="Registrado">
              <span className="block first-letter:uppercase">{trace.createdAt}</span>
              <span className="text-muted-foreground block">por {trace.createdBy}</span>
            </Row>
            {trace.editedAt && (
              <Row label="Última edición">
                <span className="block first-letter:uppercase">{trace.editedAt}</span>
                <span className="text-muted-foreground block">
                  por {trace.editedBy}
                  {trace.edits > 1 && ` · editado ${trace.edits} veces`}
                </span>
              </Row>
            )}
          </dl>
          {canEdit && (
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full sm:h-10 sm:w-auto sm:text-sm"
                onClick={() => (setViewing(false), setEditing(true))}
              >
                Editar
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {canEdit && <OtherPaymentFormDialog open={editing} onOpenChange={setEditing} payment={payment} title={`Editar ${code}`} />}

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`¿Borrar el pago ${code}?`}
        description={
          <>
            {payment.note} por <strong>{formatMoney(payment.amount, payment.currency)}</strong>.
          </>
        }
        pending={remove.pending}
        onConfirm={() => remove.run({ id: payment.id })}
      />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 px-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}
