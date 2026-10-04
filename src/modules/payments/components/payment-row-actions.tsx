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
import type { PaymentMethod } from "@/generated/prisma/browser";
import { softDeletePayment } from "../actions/payments";
import { PAYMENT_METHOD_LABELS } from "../labels";
import type { CaptureOptions, PaymentTrace } from "../queries";
import { PaymentFormDialog, type PaymentFormValues } from "./payment-form-dialog";

type Props = {
  payment: PaymentFormValues & { code: number };
  /** Lo que muestra «Ver detalle» además de los datos del pago. */
  detail: { supplierName: string; categoryName: string; debtCode: number | null; trace: PaymentTrace };
  options: CaptureOptions;
  defaultMethod: PaymentMethod;
  canEdit: boolean;
  canDelete: boolean;
};

/** Ver detalle (todos), editar y borrar (según permisos calculados en el servidor). */
export function PaymentRowActions({ payment, detail, options, defaultMethod, canEdit, canDelete }: Props) {
  const [viewing, setViewing] = useState(false);
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
        onView={() => setViewing(true)}
        onEdit={canEdit ? () => setEditing(true) : undefined}
        onDelete={canDelete ? () => setDeleting(true) : undefined}
      />
      <PaymentDetailDialog
        open={viewing}
        onOpenChange={setViewing}
        code={code}
        payment={payment}
        detail={detail}
        onEdit={canEdit ? () => (setViewing(false), setEditing(true)) : undefined}
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

function PaymentDetailDialog({
  open,
  onOpenChange,
  code,
  payment,
  detail,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  payment: PaymentFormValues;
  detail: Props["detail"];
  onEdit?: () => void;
}) {
  const { trace } = detail;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Solo lectura: sin enfocar «Editar» al abrir (se veía resaltado). */}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Pago {code}</DialogTitle>
          <DialogDescription>{detail.supplierName}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xl font-bold tabular-nums">{formatMoney(payment.amount, payment.currency)}</span>
          {detail.debtCode ? (
            <Badge variant="secondary" className="bg-toga-green-soft text-toga-green-strong">
              Abono a {formatCode("debt", detail.debtCode)}
            </Badge>
          ) : (
            <Badge variant="outline">Contado</Badge>
          )}
        </div>

        <dl className="divide-y rounded-2xl border text-sm">
          <Row label="Concepto">{payment.concept}</Row>
          <Row label="Categoría">{detail.categoryName}</Row>
          <Row label="Método">{PAYMENT_METHOD_LABELS[payment.paymentMethod]}</Row>
          {payment.currency !== "MXN" && payment.exchangeRate && (
            <Row label="Tipo de cambio">
              1 {payment.currency} = {formatMoney(payment.exchangeRate, "MXN")}
            </Row>
          )}
          <Row label="Fecha del pago">
            <span className="block first-letter:uppercase">{formatDay(payment.date as DayKey, "EEEE d 'de' MMMM yyyy")}</span>
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

        {onEdit && (
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" className="w-full sm:h-10 sm:w-auto sm:text-sm" onClick={onEdit}>
              Editar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
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
