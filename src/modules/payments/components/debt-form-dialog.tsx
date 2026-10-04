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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { formatCode } from "@/lib/codes";
import { getToday } from "@/lib/date";
import { CURRENCIES } from "@/lib/validation";
import { createDebt, updateDebt } from "../actions/debts";

const NONE = "none";

export type DebtFormValues = {
  id: string;
  kind: "OPENING_BALANCE" | "CREDIT";
  date: string;
  description: string;
  amount: string;
  currency: string;
  categoryId: string | null;
  dueDate: string | null;
  supplierRef: string | null;
  notes: string | null;
};

type Props = {
  supplierId: string;
  supplierName: string;
  categories: { id: string; name: string }[];
  debt?: DebtFormValues;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** Nuevo adeudo: mercancía o trabajo que el proveedor entregó a crédito. */
export function DebtFormDialog({ trigger, open, onOpenChange, ...props }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DebtForm {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function DebtForm({
  supplierId,
  supplierName,
  categories,
  debt,
  onDone,
}: Omit<Props, "trigger" | "open" | "onOpenChange"> & { onDone: () => void }) {
  const isEdit = Boolean(debt);
  const initial = () => ({
    date: debt?.date ?? (getToday() as string),
    description: debt?.description ?? "",
    amount: debt?.amount ?? "",
    currency: debt?.currency ?? "MXN",
    categoryId: debt?.categoryId ?? NONE,
    dueDate: debt?.dueDate ?? "",
    supplierRef: debt?.supplierRef ?? "",
    notes: debt?.notes ?? "",
  });
  const [values, setValues] = useState(initial);
  const [showCurrency, setShowCurrency] = useState(() => (debt?.currency ?? "MXN") !== "MXN");
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const create = useAction(createDebt, {
    errorToast: false,
    success: (saved) => `Adeudo ${formatCode("debt", saved.code)} registrado.`,
    onSuccess: onDone,
  });
  const update = useAction(updateDebt, {
    errorToast: false, success: "Adeudo actualizado.", onSuccess: onDone });
  const action = isEdit ? update : create;
  const errors = action.fieldErrors;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const input = {
      supplierId,
      kind: debt?.kind ?? "CREDIT",
      ...values,
      currency: values.currency as (typeof CURRENCIES)[number],
      categoryId: values.categoryId === NONE ? null : values.categoryId,
    };
    if (debt) update.run({ ...input, id: debt.id });
    else create.run(input);
  }

  const title = isEdit ? `Editar ${debt?.kind === "OPENING_BALANCE" ? "saldo inicial" : "adeudo"}` : "Nuevo adeudo";

  return (
    <>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isEdit ? supplierName : `Lo que ${supplierName} te entregó a crédito. Después le registras abonos.`}
          </DialogDescription>
        </DialogHeader>

        <form id="debt-form" onSubmit={submit} className="space-y-4">
          <FormError message={action.error && !Object.keys(errors).length ? action.error : null} />

          <Field label="Descripción" htmlFor="d-desc" required error={errors.description} hint="Qué se recibió. Por ejemplo: «50 g de plata .925»">
            <Input id="d-desc" value={values.description} onChange={(e) => set("description", e.target.value)} className="h-11" autoFocus aria-invalid={!!errors.description} />
          </Field>

          <div className="space-y-2">
            <Field label="Monto total" htmlFor="d-amount" required error={errors.amount}>
              <MoneyInput id="d-amount" value={values.amount} currency={values.currency} onValueChange={(v) => set("amount", v)} aria-invalid={!!errors.amount} />
            </Field>
            {showCurrency || values.currency !== "MXN" ? (
              <Field label="Moneda" htmlFor="d-currency" error={errors.currency}>
                <Select value={values.currency} onValueChange={(v) => set("currency", v)}>
                  <SelectTrigger id="d-currency" className="h-11 w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <button type="button" className="text-muted-foreground inline-flex min-h-10 items-center text-sm underline underline-offset-4" onClick={() => setShowCurrency(true)}>
                ¿En dólares?
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha" htmlFor="d-date" required error={errors.date}>
              <DayInput id="d-date" value={values.date} onChange={(v) => set("date", v)} />
            </Field>
            <Field label="Fecha límite de pago" htmlFor="d-due" error={errors.dueDate} hint="Opcional">
              <DayInput id="d-due" value={values.dueDate} onChange={(v) => set("dueDate", v)} shortcuts={[]} clearable placeholder="Sin fecha límite" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Categoría de gasto" htmlFor="d-category" error={errors.categoryId} hint="Sus abonos la usan por defecto">
              <Select value={values.categoryId} onValueChange={(v) => set("categoryId", v)}>
                <SelectTrigger id="d-category" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin categoría</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Nota o folio del proveedor" htmlFor="d-ref" error={errors.supplierRef} hint="Opcional">
              <Input id="d-ref" value={values.supplierRef} onChange={(e) => set("supplierRef", e.target.value)} className="h-11" />
            </Field>
          </div>

          <Field label="Notas" htmlFor="d-notes" error={errors.notes}>
            <Textarea id="d-notes" value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </Field>
        </form>

        <DialogFooter>
          <Button type="button" variant="ghost" size="lg" onClick={onDone} disabled={action.pending} className="sm:h-10 sm:text-sm">
            Cancelar
          </Button>
          <Button type="submit" variant="brand" size="lg" form="debt-form" disabled={action.pending} className="sm:h-10 sm:text-sm">
            {action.pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Registrar adeudo"}
          </Button>
        </DialogFooter>
    </>
  );
}
