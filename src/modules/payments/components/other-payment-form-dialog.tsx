"use client";

import { useState } from "react";
import { Field, FormError } from "@/components/form/field";
import { DayInput } from "@/components/form/day-input";
import { MoneyInput } from "@/components/form/money-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { formatCode } from "@/lib/codes";
import { formatForDisplay, getToday } from "@/lib/date";
import { createOtherPayment, updateOtherPayment } from "../actions/other-payments";

/** Lo que el formulario necesita de un pago sin proveedor ya guardado. */
export type OtherPaymentFormValues = {
  id: string;
  date: string;
  time: string;
  amount: string;
  note: string;
};

type Props = {
  /** Con `payment` edita; sin él, registra uno nuevo con el día y la hora de ahora. */
  payment?: OtherPaymentFormValues;
  title?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function OtherPaymentFormDialog({ trigger, open, onOpenChange, ...props }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <OtherPaymentForm {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function OtherPaymentForm({ payment, title, onDone }: Pick<Props, "payment" | "title"> & { onDone: () => void }) {
  const isEdit = Boolean(payment);
  // El formulario se monta al abrir: «ahora» es el momento en que se abrió.
  const [values, setValues] = useState(() => ({
    amount: payment?.amount ?? "",
    note: payment?.note ?? "",
    date: payment?.date ?? getToday(),
    time: payment?.time ?? formatForDisplay(new Date(), "HH:mm"),
  }));
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((v) => ({ ...v, [key]: value }));

  const create = useAction(createOtherPayment, {
    errorToast: false,
    success: (saved) => `Pago ${formatCode("otherPayment", saved.code)} registrado.`,
    onSuccess: onDone,
  });
  const update = useAction(updateOtherPayment, { errorToast: false, success: "Pago actualizado.", onSuccess: onDone });
  const action = isEdit ? update : create;
  const errors = action.fieldErrors;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (payment) update.run({ ...values, id: payment.id });
    else create.run(values);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title ?? (isEdit ? "Editar pago sin proveedor" : "Pago sin proveedor")}</DialogTitle>
        <DialogDescription>Dinero que sale sin ser para un proveedor. No toca ningún saldo ni nota.</DialogDescription>
      </DialogHeader>

      <form id="other-payment-form" onSubmit={submit} className="space-y-4">
        <FormError message={action.error && !Object.keys(errors).length ? action.error : null} />

        <Field label="Cantidad" htmlFor="op-amount" required error={errors.amount}>
          <MoneyInput
            id="op-amount"
            value={values.amount}
            onValueChange={(v) => set("amount", v)}
            placeholder="0.00"
            className="h-12 text-lg font-bold"
            aria-invalid={!!errors.amount}
            autoFocus={!isEdit}
          />
        </Field>

        <Field label="Nota" htmlFor="op-note" required error={errors.note} hint="¿En qué se fue? Por ejemplo: «Comida del taller» o «Paquetería».">
          <Textarea
            id="op-note"
            rows={3}
            maxLength={500}
            value={values.note}
            onChange={(e) => set("note", e.target.value)}
            className="text-base sm:text-sm"
            aria-invalid={!!errors.note}
          />
        </Field>

        {/* min-w-0: el calendario y la hora comparten la fila sin estirar el panel en 360 px. */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,8rem)] gap-3">
          <Field label="Día" htmlFor="op-date" required error={errors.date} className="min-w-0">
            <DayInput id="op-date" value={values.date} onChange={(v) => set("date", v)} />
          </Field>
          <Field label="Hora" htmlFor="op-time" required error={errors.time} className="min-w-0">
            <Input id="op-time" type="time" value={values.time} onChange={(e) => set("time", e.target.value)} className="h-11" aria-invalid={!!errors.time} />
          </Field>
        </div>
      </form>

      <DialogFooter>
        <Button type="button" variant="ghost" size="lg" onClick={onDone} disabled={action.pending} className="sm:h-10 sm:text-sm">
          Cancelar
        </Button>
        <Button type="submit" variant="brand" size="lg" form="other-payment-form" disabled={action.pending} className="sm:h-10 sm:text-sm">
          {action.pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Registrar pago"}
        </Button>
      </DialogFooter>
    </>
  );
}
