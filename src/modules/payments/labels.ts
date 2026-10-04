import type { DebtKind, PaymentMethod } from "@/generated/prisma/browser";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta",
  CHEQUE: "Cheque",
};

export const DEBT_KIND_LABELS: Record<DebtKind, string> = {
  OPENING_BALANCE: "Saldo inicial",
  CREDIT: "Crédito",
};
