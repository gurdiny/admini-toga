import { z } from "zod";
import { DebtKind, PaymentMethod } from "@/generated/prisma/browser";
import { toDecimal } from "@/lib/money";
import {
  zCheckbox,
  zCurrency,
  zDay,
  zId,
  zMoneyRow,
  zOptionalDay,
  zOptionalEmail,
  zOptionalId,
  zOptionalPhone,
  zOptionalText,
  zText,
} from "@/lib/validation";
import { CHARGES_REQUIRED_MESSAGE, SPLIT_REQUIRED_MESSAGE } from "./charges";

// ─── Los dos renglones de la nota ──────────────────────────────────────────
// Una nota y un pago se capturan por renglón (metal y mano de obra) y el
// total sale de sumarlos: así nunca se guarda un total que no cuadre con sus
// mitades (la base lo exige con un CHECK).

const splitFields = { amountMetal: zMoneyRow, amountLabor: zMoneyRow };
type SplitFields = { amountMetal: string; amountLabor: string };

const splitTotal = (data: SplitFields) => toDecimal(data.amountMetal).add(data.amountLabor);

/** Al menos un renglón con monto: una nota de cero pesos no existe. */
const hasAmount = (data: SplitFields) => splitTotal(data).gt(0);
const SPLIT_ISSUE = { path: ["amountMetal"], message: SPLIT_REQUIRED_MESSAGE };

/** Agrega el total que se guarda en `amount`. */
function withTotal<T extends SplitFields>(data: T) {
  return { ...data, amount: splitTotal(data).toFixed(2) };
}

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
  /** Qué se le paga: decide los renglones de su nota. Al menos uno (lo exige el CHECK de la base). */
  chargesMetal: zCheckbox,
  chargesLabor: zCheckbox,
  contactName: zOptionalText(120),
  phone: zOptionalPhone,
  hasWhatsApp: zCheckbox,
  email: zOptionalEmail,
  address: zOptionalText(300),
  notes: zOptionalText(),
});

/** Al menos una casilla: un proveedor al que no se le paga nada no puede tener nota. */
function atLeastOneCharge(data: { chargesMetal: boolean; chargesLabor: boolean }): boolean {
  return data.chargesMetal || data.chargesLabor;
}
const CHARGES_ISSUE = { path: ["chargesMetal"], message: CHARGES_REQUIRED_MESSAGE };

/** Sin teléfono no hay WhatsApp. */
function withoutPhoneNoWhatsApp<T extends { phone: string | null; hasWhatsApp: boolean }>(data: T): T {
  return { ...data, hasWhatsApp: data.hasWhatsApp && data.phone !== null };
}

/** Alta de proveedor, con la sección opcional "Ya le debo". */
export const supplierSchema = supplierFields
  .extend({
    /** Crea un adeudo OPENING_BALANCE en la misma transacción. */
    openingBalance: z
      .object({ ...splitFields, date: zDay, description: zOptionalText(200) })
      .refine(hasAmount, SPLIT_ISSUE)
      .transform(withTotal)
      .nullish()
      .transform((value) => value ?? null),
  })
  .refine(atLeastOneCharge, CHARGES_ISSUE)
  .transform(withoutPhoneNoWhatsApp);

/** Edición de proveedor. El saldo inicial se corrige editando su adeudo, no aquí. */
export const updateSupplierSchema = supplierFields
  .extend({ id: zId("El proveedor") })
  .refine(atLeastOneCharge, CHARGES_ISSUE)
  .transform(withoutPhoneNoWhatsApp);

// ─── Adeudo ────────────────────────────────────────────────────────────────

const debtFields = z.object({
  supplierId: zId("El proveedor"),
  kind: z.enum(DebtKind).default("CREDIT"),
  date: zDay,
  description: zText("La descripción", 200),
  ...splitFields,
  currency: zCurrency,
  categoryId: zOptionalId,
  dueDate: zOptionalDay,
  supplierRef: zOptionalText(60),
  notes: zOptionalText(),
});

const dueAfterDate = (data: { date: Date; dueDate: Date | null }) =>
  !data.dueDate || data.dueDate.getTime() >= data.date.getTime();
const DUE_ISSUE = {
  path: ["dueDate"],
  message: "La fecha límite no puede ser anterior a la fecha del adeudo.",
};

export const debtSchema = debtFields.refine(dueAfterDate, DUE_ISSUE).refine(hasAmount, SPLIT_ISSUE).transform(withTotal);

/** El proveedor de una nota no se cambia: sus abonos están amarrados a él. */
export const updateDebtSchema = debtFields
  .extend({ id: zId("El adeudo") })
  .refine(dueAfterDate, DUE_ISSUE)
  .refine(hasAmount, SPLIT_ISSUE)
  .transform(withTotal);

// ─── Pago / abono ──────────────────────────────────────────────────────────

const paymentFields = z.object({
  date: zDay,
  supplierId: zId("El proveedor"),
  categoryId: zId("La categoría"),
  concept: zText("El concepto", 200),
  ...splitFields,
  currency: zCurrency,
  exchangeRate: zExchangeRate,
  paymentMethod: z.enum(PaymentMethod, { error: "Elige el método de pago." }),
  /** Nota a la que abona; null = pago de contado. */
  debtId: zOptionalId,
  orderId: zOptionalId,
});

export const paymentSchema = paymentFields
  .superRefine(requireExchangeRate)
  .refine(hasAmount, SPLIT_ISSUE)
  .transform(withTotal);

export const updatePaymentSchema = paymentFields
  .extend({ id: zId("El pago") })
  .superRefine(requireExchangeRate)
  .refine(hasAmount, SPLIT_ISSUE)
  .transform(withTotal);

export const idSchema = z.object({ id: zId() });

/**
 * Borrar. `confirm` es la casilla que se exige cuando el borrado se lleva
 * algo más por delante (una nota con abonos, un proveedor con movimientos).
 */
export const deleteSchema = z.object({ id: zId(), confirm: zCheckbox });

export type SupplierInput = z.input<typeof supplierSchema>;
export type DebtInput = z.input<typeof debtSchema>;
export type PaymentInput = z.input<typeof paymentSchema>;
