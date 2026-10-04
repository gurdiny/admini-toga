// Columnas del archivo de pagos (Excel y CSV). Encabezados en español.

import { formatCode } from "@/lib/codes";
import { formatDay, type DayRange } from "@/lib/date";
import type { ExportColumn } from "@/lib/export";
import { PAYMENT_METHOD_LABELS } from "./labels";
import type { PaymentExportRow } from "./queries";

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
  { header: "Monto", width: 14, kind: "money", value: (p) => p.amount },
  { header: "Tipo de cambio", width: 10, kind: "number", value: (p) => p.exchangeRate },
  { header: "Monto en pesos", width: 15, kind: "money", value: (p) => p.amountMXN },
  { header: "Pedido de cliente", width: 26, value: (p) => (p.clientCode ? `${formatCode("client", p.clientCode)} ${p.clientName}` : null) },
  { header: "Capturó", width: 14, value: (p) => p.createdByName },
  { header: "Capturado", width: 17, value: (p) => p.createdAt },
];

/** "pagos_2026-10-01_a_2026-10-31" */
export function paymentsFileName(range: DayRange): string {
  return range.from === range.to ? `pagos_${range.from}` : `pagos_${range.from}_a_${range.to}`;
}

/** Título de la hoja: «Pagos a proveedores · 1 oct – 31 oct 2026». */
export function paymentsTitle(range: DayRange, q: string): string {
  const days =
    range.from === range.to ? formatDay(range.from, "d MMM yyyy") : `${formatDay(range.from, "d MMM")} – ${formatDay(range.to, "d MMM yyyy")}`;
  return `Pagos a proveedores · ${days}${q ? ` · búsqueda «${q}»` : ""}`;
}
