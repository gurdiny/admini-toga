"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Field, FormError } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { cn } from "@/lib/utils";
import { CURRENCIES } from "@/lib/validation";
import type { PaymentMethod } from "@/generated/prisma/browser";
import { PAYMENT_METHOD_LABELS } from "@/modules/payments/labels";
import { DEFAULT_READY_MESSAGE, readyMessage } from "@/modules/reminders/whatsapp";
import { saveSettings } from "../actions/settings";
import type { SettingsInput } from "../schemas";

type Values = {
  businessName: string;
  defaultCurrency: (typeof CURRENCIES)[number];
  defaultPaymentMethod: PaymentMethod;
  overdueLookbackDays: string;
  readyMessage: string;
  modules: { payments: boolean; reminders: boolean };
};

const MODULES = [
  { key: "payments", label: "Pagos a proveedores", detail: "Pagos, adeudos, proveedores y el botón ➕." },
  { key: "reminders", label: "Recordatorios", detail: "Pedidos de clientes y avisos por WhatsApp." },
] as const;

export function SettingsForm({ initial }: { initial: Omit<Values, "overdueLookbackDays"> & { overdueLookbackDays: number } }) {
  const [values, setValues] = useState<Values>({ ...initial, overdueLookbackDays: String(initial.overdueLookbackDays) });
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));
  const save = useAction(saveSettings, {
    errorToast: false,
    success: (r) => (r.changed ? `Configuración guardada (${r.changed} cambio${r.changed === 1 ? "" : "s"}).` : "No había cambios."),
  });
  const errors = save.fieldErrors;
  const preview = readyMessage(values.readyMessage, { name: "María López", code: 1, phone: null }, values.businessName || "TOGA");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.run({ ...values, overdueLookbackDays: values.overdueLookbackDays } as SettingsInput);
      }}
      className="space-y-4"
    >
      <FormError message={save.error && !Object.keys(errors).length ? save.error : null} />

      <Section title="Negocio">
        <Field label="Nombre del negocio" htmlFor="s-business" required error={errors.businessName} hint="Aparece en el mensaje de WhatsApp a los clientes.">
          <Input id="s-business" value={values.businessName} onChange={(e) => set("businessName", e.target.value)} className="h-11" />
        </Field>
      </Section>

      <Section title="Al capturar un pago o adeudo">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Moneda por defecto" htmlFor="s-currency" error={errors.defaultCurrency}>
            <Select value={values.defaultCurrency} onValueChange={(v) => set("defaultCurrency", v as Values["defaultCurrency"])}>
              <SelectTrigger id="s-currency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c === "MXN" ? "Pesos (MXN)" : "Dólares (USD)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Método de pago por defecto" htmlFor="s-method" error={errors.defaultPaymentMethod}>
            <Select value={values.defaultPaymentMethod} onValueChange={(v) => set("defaultPaymentMethod", v as PaymentMethod)}>
              <SelectTrigger id="s-method" className="w-full">
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
      </Section>

      <Section title="Recordatorios">
        <Field
          label="Días que se muestran en «Atrasados»"
          htmlFor="s-overdue"
          error={errors.overdueLookbackDays}
          hint="Lo más viejo no se pierde: se avisa y se puede ver con un toque. 0 = mostrar todo."
        >
          <Input id="s-overdue" inputMode="numeric" value={values.overdueLookbackDays} onChange={(e) => set("overdueLookbackDays", e.target.value.replace(/\D/g, ""))} className="h-11 w-32" />
        </Field>
        <Field label="Mensaje de «pedido listo» por WhatsApp" htmlFor="s-ready" required error={errors.readyMessage} hint="Variables: {cliente} (primer nombre), {negocio}, {folio}.">
          <Textarea id="s-ready" rows={4} value={values.readyMessage} onChange={(e) => set("readyMessage", e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => set("readyMessage", DEFAULT_READY_MESSAGE)}>
            Restaurar mensaje original
          </Button>
        </div>
        <div className="bg-toga-green-soft rounded-2xl p-4 text-sm">
          <p className="text-toga-green-strong mb-1 flex items-center gap-1 text-xs font-bold">
            <MessageCircle className="size-3.5" aria-hidden /> Así lo recibe el cliente
          </p>
          <p className="whitespace-pre-line">{preview}</p>
        </div>
      </Section>

      <Section title="Módulos visibles">
        {errors.modules && <p className="text-destructive text-sm">{errors.modules}</p>}
        <div className="space-y-2">
          {MODULES.map((m) => {
            const on = values.modules[m.key];
            return (
              <label key={m.key} className={cn("flex min-h-14 items-center gap-3 rounded-2xl border p-3", on && "border-toga-green bg-toga-green-soft")}>
                <input
                  type="checkbox"
                  className="accent-toga-green-strong size-5"
                  checked={on}
                  onChange={(e) => set("modules", { ...values.modules, [m.key]: e.target.checked })}
                />
                <span>
                  <span className="block text-sm font-bold">{m.label}</span>
                  <span className="text-muted-foreground block text-sm">{m.detail}</span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="text-muted-foreground text-sm">Apagar un módulo lo oculta para todos; sus datos se conservan.</p>
      </Section>

      <div className="bg-background/95 sticky bottom-20 z-10 -mx-4 px-4 py-3 backdrop-blur md:bottom-0">
        <Button type="submit" variant="brand" size="lg" className="w-full sm:w-auto" disabled={save.pending}>
          {save.pending ? "Guardando…" : "Guardar configuración"}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card shadow-toga space-y-4 rounded-2xl p-4">
      <h2 className="font-bold">{title}</h2>
      {children}
    </section>
  );
}
