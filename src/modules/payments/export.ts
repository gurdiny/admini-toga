// Columnas del archivo de pagos (Excel y CSV). Encabezados en español.

import { formatCode } from "@/lib/codes";
import { formatDay, type DayRange } from "@/lib/date";
import type { ExportColumn } from "@/lib/export";
import { PAYMENT_METHOD_LABELS } from "./labels";
import type { PaymentView } from "./filters";
import type { AllPaymentsExportRow, OtherPaymentExportRow, PaymentExportRow } from "./queries";

export const PAYMENT_EXPORT_COLUMNS: ExportColumn<PaymentExportRow>[] = [
  { header: "Folio", width: 11, value: (p) => formatCode("payment", p.code) },
  { header: "Fecha", width: 12, kind: "day", value: (p) => p.date },
  { header: "Proveedor", width: 28, value: (p) => p.supplierName },
  { header: "Código proveedor", width: 12, value: (p) => formatCode("supplier", p.supplierCode) },
  { header: "Concepto", width: 36, value: (p) => p.concept },
  { header: "Categoría", width: 16, value: (p) => p.categoryName },
  { header: "Método", width: 14, value: (p) => PAYMENT_METHOD_LABELS[p.paymentMethod] },
  { header: "Tipo", width: 18, value: (p) => (p.debtCode ? `Abono a ${formatCode("debt", p.debtCode)}` : "Contado") },
  { header: "Moneda", width: 8, value: (p) => p.currency },
  { header: "Metal", width: 14, kind: "money", value: (p) => p.amountMetal },
  { header: "Mano de obra", width: 14, kind: "money", value: (p) => p.amountLabor },
  { header: "Monto", width: 14, kind: "money", value: (p) => p.amount },
  { header: "Tipo de cambio", width: 10, kind: "number", value: (p) => p.exchangeRate },
  { header: "Monto en pesos", width: 15, kind: "money", value: (p) => p.amountMXN },
  { header: "Pedido de cliente", width: 26, value: (p) => (p.clientCode ? `${formatCode("client", p.clientCode)} ${p.clientName}` : null) },
  { header: "Capturó", width: 14, value: (p) => p.createdByName },
  { header: "Capturado", width: 17, value: (p) => p.createdAt },
];

/** Pagos sin proveedor: siempre en pesos. */
export const OTHER_PAYMENT_EXPORT_COLUMNS: ExportColumn<OtherPaymentExportRow>[] = [
  { header: "Folio", width: 11, value: (p) => formatCode("otherPayment", p.code) },
  { header: "Fecha", width: 12, kind: "day", value: (p) => p.date },
  { header: "Hora", width: 8, value: (p) => p.time },
  { header: "Nota", width: 48, value: (p) => p.note },
  { header: "Monto en pesos", width: 15, kind: "money", value: (p) => p.amount },
  { header: "Capturó", width: 14, value: (p) => p.createdByName },
  { header: "Capturado", width: 17, value: (p) => p.createdAt },
];

/** Todos: los dos tipos de pago con las columnas que comparten. */
export const ALL_PAYMENTS_EXPORT_COLUMNS: ExportColumn<AllPaymentsExportRow>[] = [
  { header: "Folio", width: 11, value: (p) => p.folio },
  { header: "Fecha", width: 12, kind: "day", value: (p) => p.date },
  { header: "Hora", width: 8, value: (p) => p.time },
  { header: "Proveedor", width: 28, value: (p) => p.supplierName ?? "Sin proveedor" },
  { header: "Concepto o nota", width: 36, value: (p) => p.concept },
  { header: "Categoría", width: 16, value: (p) => p.categoryName },
  { header: "Método", width: 14, value: (p) => (p.paymentMethod ? PAYMENT_METHOD_LABELS[p.paymentMethod] : null) },
  { header: "Tipo", width: 18, value: (p) => p.type },
  { header: "Moneda", width: 8, value: (p) => p.currency },
  { header: "Monto", width: 14, kind: "money", value: (p) => p.amount },
  { header: "Monto en pesos", width: 15, kind: "money", value: (p) => p.amountMXN },
  { header: "Capturó", width: 14, value: (p) => p.createdByName },
  { header: "Capturado", width: 17, value: (p) => p.createdAt },
];

const FILE_PREFIX: Record<PaymentView, string> = { proveedores: "pagos", "sin-proveedor": "pagos-sin-proveedor", todos: "pagos-todos" };
const SHEET_TITLE: Record<PaymentView, string> = {
  proveedores: "Pagos a proveedores",
  "sin-proveedor": "Pagos sin proveedor",
  todos: "Todos los pagos",
};

/** "pagos_2026-10-01_a_2026-10-31", "pagos-sin-proveedor_2026-10-04"… */
export function paymentsFileName(range: DayRange, view: PaymentView = "proveedores"): string {
  const prefix = FILE_PREFIX[view];
  return range.from === range.to ? `${prefix}_${range.from}` : `${prefix}_${range.from}_a_${range.to}`;
}

/** Título de la hoja: «Pagos a proveedores · 1 oct – 31 oct 2026». */
export function paymentsTitle(range: DayRange, q: string, view: PaymentView = "proveedores"): string {
  const days =
    range.from === range.to ? formatDay(range.from, "d MMM yyyy") : `${formatDay(range.from, "d MMM")} – ${formatDay(range.to, "d MMM yyyy")}`;
  return `${SHEET_TITLE[view]} · ${days}${q ? ` · búsqueda «${q}»` : ""}`;
}
