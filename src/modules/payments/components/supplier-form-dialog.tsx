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
import { createSupplier, updateSupplier } from "../actions/suppliers";

const NONE = "none";

export type SupplierFormValues = {
  id: string;
  name: string;
  categoryId: string | null;
  contactName: string | null;
  phone: string | null;
  hasWhatsApp: boolean;
  email: string | null;
  address: string | null;
  notes: string | null;
};

type Saved = { id: string; code: number; name: string };

type Props = {
  categories: { id: string; name: string }[];
  /** Con `supplier` edita; sin él, da de alta. */
  supplier?: SupplierFormValues;
  /** Nombre precargado al crear desde el buscador de proveedores. */
  initialName?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved?: (supplier: Saved) => void;
};

export function SupplierFormDialog({ trigger, open, onOpenChange, ...props }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {/* El formulario se monta al abrir: siempre arranca con datos frescos. */}
        <SupplierForm {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function SupplierForm({
  categories,
  supplier,
  initialName,
  onSaved,
  onDone,
}: Omit<Props, "trigger" | "open" | "onOpenChange"> & { onDone: () => void }) {
  const isEdit = Boolean(supplier);
  const [values, setValues] = useState(() => ({
    name: supplier?.name ?? initialName ?? "",
    categoryId: supplier?.categoryId ?? NONE,
    contactName: supplier?.contactName ?? "",
    phone: supplier?.phone ?? "",
    hasWhatsApp: supplier?.hasWhatsApp ?? false,
    email: supplier?.email ?? "",
    address: supplier?.address ?? "",
    notes: supplier?.notes ?? "",
    owes: false,
    obAmount: "",
    obDate: getToday() as string,
    obDescription: "",
  }));
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const onSuccess = (saved: Saved) => {
    onDone();
    onSaved?.(saved);
  };
  const create = useAction(createSupplier, {
    errorToast: false,
    success: (saved) => `Proveedor ${formatCode("supplier", saved.code)} dado de alta.`,
    onSuccess,
  });
  const update = useAction(updateSupplier, {
    errorToast: false, success: "Proveedor actualizado.", onSuccess });
  const action = isEdit ? update : create;
  const errors = action.fieldErrors;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const base = {
      name: values.name,
      categoryId: values.categoryId === NONE ? null : values.categoryId,
      contactName: values.contactName,
      phone: values.phone,
      hasWhatsApp: values.hasWhatsApp,
      email: values.email,
      address: values.address,
      notes: values.notes,
    };
    if (supplier) {
      update.run({ ...base, id: supplier.id });
    } else {
      const openingBalance = values.owes
        ? { amount: values.obAmount, date: values.obDate, description: values.obDescription }
        : null;
      create.run({ ...base, openingBalance });
    }
  }

  return (
    <>
        <DialogHeader>          <DialogTitle>{isEdit ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
          <DialogDescription>Solo el nombre es obligatorio.</DialogDescription>
        </DialogHeader>

        <form id="supplier-form" onSubmit={submit} className="space-y-4">
          <FormError message={action.error && !Object.keys(errors).length ? action.error : null} />

          <Field label="Nombre" htmlFor="s-name" required error={errors.name}>
            <Input id="s-name" value={values.name} onChange={(e) => set("name", e.target.value)} className="h-11" autoFocus aria-invalid={!!errors.name} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de proveedor" htmlFor="s-category" error={errors.categoryId}>
              <Select value={values.categoryId} onValueChange={(v) => set("categoryId", v)}>
                <SelectTrigger id="s-category" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin tipo</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Persona de contacto" htmlFor="s-contact" error={errors.contactName}>
              <Input id="s-contact" value={values.contactName} onChange={(e) => set("contactName", e.target.value)} className="h-11" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Teléfono" htmlFor="s-phone" error={errors.phone} hint="10 dígitos">
              <Input id="s-phone" type="tel" inputMode="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} className="h-11" aria-invalid={!!errors.phone} />
            </Field>
            <label className="flex min-h-11 items-center gap-3 self-end pb-1 text-sm sm:pb-7">
              <input
                type="checkbox"
                className="accent-toga-green-strong size-5"
                checked={values.hasWhatsApp && values.phone.trim() !== ""}
                disabled={values.phone.trim() === ""}
                onChange={(e) => set("hasWhatsApp", e.target.checked)}
              />
              Tiene WhatsApp
            </label>
          </div>

          <Field label="Correo" htmlFor="s-email" error={errors.email}>
            <Input id="s-email" type="email" inputMode="email" value={values.email} onChange={(e) => set("email", e.target.value)} className="h-11" aria-invalid={!!errors.email} />
          </Field>
          <Field label="Dirección" htmlFor="s-address" error={errors.address}>
            <Input id="s-address" value={values.address} onChange={(e) => set("address", e.target.value)} className="h-11" />
          </Field>
          <Field label="Notas" htmlFor="s-notes" error={errors.notes}>
            <Textarea id="s-notes" value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </Field>

          {!isEdit && (
            <fieldset className="bg-muted/50 space-y-4 rounded-lg border p-4">
              <label className="flex items-center gap-3 font-bold">
                <input type="checkbox" className="accent-toga-green-strong size-5" checked={values.owes} onChange={(e) => set("owes", e.target.checked)} />
                Ya le debo
              </label>
              {values.owes && (
                <>
                  <p className="text-muted-foreground text-sm">
                    Lo que le debes hoy a este proveedor. Se guarda como su saldo inicial y después le registras abonos.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Monto que le debo" htmlFor="s-ob-amount" required error={errors["openingBalance.amount"]}>
                      <MoneyInput id="s-ob-amount" value={values.obAmount} onValueChange={(v) => set("obAmount", v)} aria-invalid={!!errors["openingBalance.amount"]} />
                    </Field>
                    <Field label="Saldo al día" htmlFor="s-ob-date" required error={errors["openingBalance.date"]}>
                      <DayInput id="s-ob-date" value={values.obDate} onChange={(v) => set("obDate", v)} />
                    </Field>
                  </div>
                  <Field label="Descripción" htmlFor="s-ob-desc" hint="Opcional. Por ejemplo: «Saldo de la nota 2231»." error={errors["openingBalance.description"]}>
                    <Input id="s-ob-desc" value={values.obDescription} onChange={(e) => set("obDescription", e.target.value)} className="h-11" />
                  </Field>
                </>
              )}
            </fieldset>
          )}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={action.pending}>
            Cancelar
          </Button>
          <Button type="submit" form="supplier-form" disabled={action.pending} className="h-11 sm:h-9">
            {action.pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Dar de alta"}
          </Button>
        </DialogFooter>
    </>
  );
}
