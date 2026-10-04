"use client";

import { useEffect, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { EntityPicker } from "@/components/form/entity-picker";
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
import { useAction } from "@/hooks/use-action";
import { formatCode, parseCode } from "@/lib/codes";
import { formatDay, getToday } from "@/lib/date";
import { formatMoney, toDecimal } from "@/lib/money";
import { toNameKey } from "@/lib/normalize";
import { cn } from "@/lib/utils";
import { CURRENCIES } from "@/lib/validation";
import type { PaymentMethod } from "@/generated/prisma/browser";
import { loadDebtsForPayment } from "../actions/debts";
import { createPayment, updatePayment } from "../actions/payments";
import { PAYMENT_METHOD_LABELS } from "../labels";
import type { CaptureOptions, DebtSummary } from "../queries";
import { SupplierFormDialog } from "./supplier-form-dialog";

const CONTADO = "contado";

export type PaymentFormValues = {
  id: string;
  date: string;
  supplierId: string;
  categoryId: string;
  concept: string;
  amount: string;
  currency: string;
  exchangeRate: string | null;
  paymentMethod: PaymentMethod;
  debtId: string | null;
};

type Props = {
  options: CaptureOptions;
  defaultMethod: PaymentMethod;
  /** Con `payment` edita; sin él, registra uno nuevo. */
  payment?: PaymentFormValues;
  /** Proveedor y adeudo preseleccionados (botón «Abonar» de un adeudo). */
  preset?: { supplierId: string; debtId?: string };
  title?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type Values = {
  supplierId: string;
  debtId: string;
  categoryId: string;
  concept: string;
  amount: string;
  currency: string;
  exchangeRate: string;
  paymentMethod: PaymentMethod;
  date: string;
};

export function PaymentFormDialog({ trigger, open, onOpenChange, ...props }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <PaymentForm {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({
  options,
  defaultMethod,
  payment,
  preset,
  title,
  onDone,
}: Omit<Props, "trigger" | "open" | "onOpenChange"> & { onDone: () => void }) {
  const isEdit = Boolean(payment);
  const initial = (): Values => ({
    supplierId: payment?.supplierId ?? preset?.supplierId ?? "",
    debtId: payment ? (payment.debtId ?? CONTADO) : (preset?.debtId ?? ""),
    categoryId: payment?.categoryId ?? "",
    concept: payment?.concept ?? "",
    amount: payment?.amount ?? "",
    currency: payment?.currency ?? options.defaults.currency,
    exchangeRate: payment?.exchangeRate ?? "",
    paymentMethod: payment?.paymentMethod ?? defaultMethod,
    date: payment?.date ?? getToday(),
  });
  const [values, setValues] = useState<Values>(initial);
  const [showCurrency, setShowCurrency] = useState(() => (payment?.currency ?? options.defaults.currency) !== "MXN");
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));

  // Proveedores: los del servidor + los creados aquí mismo.
  const [suppliers, setSuppliers] = useState(options.suppliers);
  const [debts, setDebts] = useState<DebtSummary[] | null>(null);
  const [loadingDebts, startLoadingDebts] = useTransition();

  const create = useAction(createPayment, {
    errorToast: false,
    success: (saved) => `Pago ${formatCode("payment", saved.code)} registrado.`,
    onSuccess: onDone,
  });
  const update = useAction(updatePayment, {
    errorToast: false, success: "Pago actualizado.", onSuccess: onDone });
  const action = isEdit ? update : create;
  const errors = action.fieldErrors;

  // Al cambiar de proveedor, trae sus adeudos abiertos.
  useEffect(() => {
    if (!values.supplierId) return;
    let cancelled = false;
    startLoadingDebts(async () => {
      const result = await loadDebtsForPayment({ supplierId: values.supplierId, includeId: payment?.debtId });
      if (cancelled) return;
      const list = result.ok ? result.data : [];
      setDebts(list);
      setValues((v) => {
        // Adeudo ya elegido (botón «Abonar» o edición): completa concepto, categoría y moneda si faltan.
        const chosen = list.find((debt) => debt.id === v.debtId);
        if (chosen) return withDebt(v, chosen);
        if (v.debtId === CONTADO) return v;
        // Sin elección: si debe algo, propone abonar al adeudo más antiguo.
        return list.length ? withDebt(v, list[0]) : { ...v, debtId: CONTADO };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [values.supplierId, payment?.debtId]);

  function withDebt(v: Values, debt: DebtSummary): Values {
    return {
      ...v,
      debtId: debt.id,
      currency: debt.currency,
      categoryId: v.categoryId || debt.categoryId || "",
      concept: v.concept || `Abono a ${formatCode("debt", debt.code)}`,
    };
  }

  function chooseDebt(id: string) {
    if (id === CONTADO) return setValues((v) => ({ ...v, debtId: CONTADO }));
    const debt = debts?.find((d) => d.id === id);
    if (debt) setValues((v) => withDebt({ ...v, concept: v.concept.startsWith("Abono a ADE-") ? "" : v.concept }, debt));
  }

  function chooseSupplier(id: string) {
    setDebts(null);
    setValues((v) => ({ ...v, supplierId: id, debtId: "", concept: v.concept.startsWith("Abono a ADE-") ? "" : v.concept }));
  }

  const selectedDebt = debts?.find((d) => d.id === values.debtId) ?? null;
  // Saldo disponible: al editar un abono, lo que ya abonó este mismo pago vuelve a estar disponible.
  const available = selectedDebt
    ? toDecimal(selectedDebt.balance).add(payment?.debtId === selectedDebt.id ? toDecimal(payment.amount) : 0)
    : null;
  const remaining = available && values.amount ? available.sub(toDecimal(values.amount || "0")) : null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const input = {
      date: values.date,
      supplierId: values.supplierId,
      categoryId: values.categoryId,
      concept: values.concept,
      amount: values.amount,
      currency: values.currency as (typeof CURRENCIES)[number],
      exchangeRate: values.currency === "MXN" ? null : values.exchangeRate,
      paymentMethod: values.paymentMethod,
      debtId: values.debtId && values.debtId !== CONTADO ? values.debtId : null,
    };
    if (payment) update.run({ ...input, id: payment.id });
    else create.run(input);
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>{title ?? (isEdit ? "Editar pago" : "Registrar pago")}</DialogTitle>
          <DialogDescription>Abono a lo que se le debe al proveedor, o pago de contado.</DialogDescription>
        </DialogHeader>

        <form id="payment-form" onSubmit={submit} className="space-y-4">
          <FormError message={action.error && !Object.keys(errors).length ? action.error : null} />

          <Field label="Proveedor" htmlFor="p-supplier" required error={errors.supplierId}>
            <SupplierPicker
              suppliers={suppliers}
              value={values.supplierId}
              disabled={isEdit && !!payment?.debtId}
              categories={options.supplierCategories}
              onChange={chooseSupplier}
              onCreated={(s) => {
                setSuppliers((list) => [...list, s].sort((a, b) => a.name.localeCompare(b.name, "es")));
                chooseSupplier(s.id);
              }}
            />
          </Field>

          {values.supplierId && (
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-medium">¿Qué estás pagando?</legend>
              {loadingDebts && !debts ? (
                <p className="text-muted-foreground text-sm">Buscando adeudos…</p>
              ) : (
                <div className="space-y-2" role="radiogroup">
                  {debts?.map((debt) => (
                    <DebtOption
                      key={debt.id}
                      checked={values.debtId === debt.id}
                      onSelect={() => chooseDebt(debt.id)}
                      title={`Abono a ${formatCode("debt", debt.code)} · ${debt.description}`}
                      detail={`Saldo ${formatMoney(debt.balance, debt.currency)} de ${formatMoney(debt.amount, debt.currency)} · ${formatDay(debt.date)}`}
                    />
                  ))}
                  <DebtOption
                    checked={values.debtId === CONTADO}
                    onSelect={() => chooseDebt(CONTADO)}
                    title="Pago de contado"
                    detail={debts?.length ? "No abona a ningún adeudo." : "Este proveedor no tiene adeudos abiertos."}
                  />
                </div>
              )}
              {errors.debtId && <p className="text-destructive text-sm">{errors.debtId}</p>}
            </fieldset>
          )}

          <div className="space-y-2">
            <Field label="Monto" htmlFor="p-amount" required error={errors.amount}>
              <MoneyInput id="p-amount" value={values.amount} currency={values.currency} onValueChange={(v) => set("amount", v)} aria-invalid={!!errors.amount} />
            </Field>
            {showCurrency || values.currency !== "MXN" ? (
              <Field label="Moneda" htmlFor="p-currency" error={errors.currency}>
                <Select value={values.currency} onValueChange={(v) => set("currency", v)} disabled={!!selectedDebt}>
                  <SelectTrigger id="p-currency" className="h-11 w-full sm:w-40">
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

          {selectedDebt && available && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className={cn(remaining?.lt(0) ? "text-destructive font-bold" : "text-muted-foreground")}>
                {remaining === null
                  ? `Saldo pendiente: ${formatMoney(available, selectedDebt.currency)}`
                  : remaining.lt(0)
                    ? `Excede el saldo por ${formatMoney(remaining.neg(), selectedDebt.currency)}`
                    : remaining.isZero()
                      ? "Con este abono queda liquidado."
                      : `Después de este abono quedará: ${formatMoney(remaining, selectedDebt.currency)}`}
              </span>
              <Button type="button" size="sm" variant="outline" onClick={() => set("amount", available.toFixed(2))}>
                Liquidar ({formatMoney(available, selectedDebt.currency)})
              </Button>
            </div>
          )}

          {values.currency !== "MXN" && (
            <Field label="Tipo de cambio a pesos" htmlFor="p-rate" required error={errors.exchangeRate} hint={`Cuántos pesos vale 1 ${values.currency}`}>
              <Input id="p-rate" inputMode="decimal" value={values.exchangeRate} onChange={(e) => set("exchangeRate", e.target.value.replace(/[^\d.]/g, ""))} className="h-11" />
            </Field>
          )}

          <Field label="Concepto" htmlFor="p-concept" required error={errors.concept}>
            <Input id="p-concept" value={values.concept} onChange={(e) => set("concept", e.target.value)} className="h-11" aria-invalid={!!errors.concept} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Categoría" htmlFor="p-category" required error={errors.categoryId}>
              <Select value={values.categoryId} onValueChange={(v) => set("categoryId", v)}>
                <SelectTrigger id="p-category" className="h-11 w-full" aria-invalid={!!errors.categoryId}>
                  <SelectValue placeholder="Elige una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {options.paymentCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Método de pago" htmlFor="p-method" required error={errors.paymentMethod}>
              <Select value={values.paymentMethod} onValueChange={(v) => set("paymentMethod", v as PaymentMethod)}>
                <SelectTrigger id="p-method" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Fecha del pago" htmlFor="p-date" required error={errors.date}>
            <DayInput id="p-date" value={values.date} onChange={(v) => set("date", v)} />
          </Field>
        </form>

        <DialogFooter>
          <Button type="button" variant="ghost" size="lg" onClick={onDone} disabled={action.pending} className="sm:h-10 sm:text-sm">
            Cancelar
          </Button>
          <Button type="submit" variant="brand" size="lg" form="payment-form" disabled={action.pending || !values.supplierId} className="sm:h-10 sm:text-sm">
            {action.pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Registrar pago"}
          </Button>
        </DialogFooter>
    </>
  );
}

function DebtOption({ checked, onSelect, title, detail }: { checked: boolean; onSelect: () => void; title: string; detail: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        checked ? "border-toga-green bg-toga-green-soft" : "hover:bg-muted",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
          checked && "border-toga-green-strong bg-toga-green-strong text-white",
        )}
        aria-hidden
      >
        {checked && <Check className="size-3.5" />}
      </span>
      <span className="space-y-0.5">
        <span className="block text-sm font-bold">{title}</span>
        <span className="text-muted-foreground block text-sm">{detail}</span>
      </span>
    </button>
  );
}

type PickerSupplier = { id: string; code: number; name: string };

/** Buscador de proveedores (en la lista ya cargada) con alta en línea si no existe. */
function SupplierPicker({
  suppliers,
  value,
  disabled,
  categories,
  onChange,
  onCreated,
}: {
  suppliers: PickerSupplier[];
  value: string;
  disabled?: boolean;
  categories: { id: string; name: string }[];
  onChange: (id: string) => void;
  onCreated: (supplier: PickerSupplier) => void;
}) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const toItem = (s: PickerSupplier) => ({ id: s.id, title: s.name, detail: formatCode("supplier", s.code) });
  const selected = suppliers.find((s) => s.id === value);
  const key = toNameKey(search);
  const code = parseCode(search, "supplier");
  const matches = search.trim() ? suppliers.filter((s) => toNameKey(s.name).includes(key) || s.code === code) : suppliers;

  return (
    <>
      <EntityPicker
        id="p-supplier"
        selected={selected ? toItem(selected) : null}
        onClear={disabled ? undefined : () => onChange("")}
        query={search}
        onQueryChange={setSearch}
        placeholder="Nombre o código (PROV-0001)"
        items={matches.map(toItem)}
        onPick={(id) => {
          setSearch("");
          onChange(id);
        }}
        emptyText={(q) => `Ningún proveedor coincide con «${q}».`}
        createLabel={(q) => (q ? `Proveedor nuevo «${q}»` : "Proveedor nuevo")}
        onCreate={() => setCreating(true)}
      />
      <SupplierFormDialog
        open={creating}
        onOpenChange={setCreating}
        categories={categories}
        initialName={search.trim()}
        onSaved={(s) => {
          setSearch("");
          onCreated(s);
        }}
      />
    </>
  );
}
