import { z } from "zod";
import { DebtKind, PaymentMethod } from "@/generated/prisma/browser";
import {
  zCheckbox,
  zCurrency,
  zDay,
  zId,
  zMoney,
  zOptionalDay,
  zOptionalEmail,
  zOptionalId,
  zOptionalPhone,
  zOptionalText,
  zText,
} from "@/lib/validation";

/** Tipo de cambio a MXN: obligatorio solo si la moneda no es MXN. */
const zExchangeRate = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value) => (value === "" || value == null ? null : String(value)))
  .refine((value) => value === null || /^\d+(\.\d{1,4})?$/.test(value), "Tipo de cambio no válido.")
  .refine((value) => value === null || Number(value) > 0, "El tipo de cambio debe ser mayor a cero.");

function requireExchangeRate(
  data: { currency: string; exchangeRate?: string | null },
  ctx: z.RefinementCtx,
) {
  if (data.currency !== "MXN" && !data.exchangeRate) {
    ctx.addIssue({ code: "custom", path: ["exchangeRate"], message: "Indica el tipo de cambio a pesos." });
  }
}

// ─── Proveedor ─────────────────────────────────────────────────────────────

const supplierFields = z.object({
  name: zText("El nombre del proveedor", 120),
  categoryId: zOptionalId,
  contactName: zOptionalText(120),
  phone: zOptionalPhone,
  hasWhatsApp: zCheckbox,
  email: zOptionalEmail,
  address: zOptionalText(300),
  notes: zOptionalText(),
});

/** Sin teléfono no hay WhatsApp. */
function withoutPhoneNoWhatsApp<T extends { phone: string | null; hasWhatsApp: boolean }>(data: T): T {
  return { ...data, hasWhatsApp: data.hasWhatsApp && data.phone !== null };
}

/** Alta de proveedor, con la sección opcional "Ya le debo". */
export const supplierSchema = supplierFields
  .extend({
    /** Crea un adeudo OPENING_BALANCE en la misma transacción. */
    openingBalance: z
      .object({ amount: zMoney, date: zDay, description: zOptionalText(200) })
      .nullish()
      .transform((value) => value ?? null),
  })
  .transform(withoutPhoneNoWhatsApp);

/** Edición de proveedor. El saldo inicial se corrige editando su adeudo, no aquí. */
export const updateSupplierSchema = supplierFields
  .extend({ id: zId("El proveedor") })
  .transform(withoutPhoneNoWhatsApp);

// ─── Adeudo ────────────────────────────────────────────────────────────────

export const debtSchema = z
  .object({
    supplierId: zId("El proveedor"),
    kind: z.enum(DebtKind).default("CREDIT"),
    date: zDay,
    description: zText("La descripción", 200),
    amount: zMoney,
    currency: zCurrency,
    categoryId: zOptionalId,
    dueDate: zOptionalDay,
    supplierRef: zOptionalText(60),
    notes: zOptionalText(),
  })
  .refine((data) => !data.dueDate || data.dueDate.getTime() >= data.date.getTime(), {
    path: ["dueDate"],
    message: "La fecha límite no puede ser anterior a la fecha del adeudo.",
  });

// ─── Pago / abono ──────────────────────────────────────────────────────────

export const paymentSchema = z
  .object({
    date: zDay,
    supplierId: zId("El proveedor"),
    categoryId: zId("La categoría"),
    concept: zText("El concepto", 200),
    amount: zMoney,
    currency: zCurrency,
    exchangeRate: zExchangeRate,
    paymentMethod: z.enum(PaymentMethod, { error: "Elige el método de pago." }),
    /** Adeudo al que abona; null = pago de contado. */
    debtId: zOptionalId,
    orderId: zOptionalId,
  })
  .superRefine(requireExchangeRate);

export const idSchema = z.object({ id: zId() });

export type SupplierInput = z.input<typeof supplierSchema>;
export type DebtInput = z.input<typeof debtSchema>;
export type PaymentInput = z.input<typeof paymentSchema>;
