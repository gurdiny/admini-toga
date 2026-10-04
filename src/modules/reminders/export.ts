// Columnas del archivo de recordatorios (Excel y CSV). Encabezados en español.

import { formatCode } from "@/lib/codes";
import { getToday } from "@/lib/date";
import type { ExportColumn } from "@/lib/export";
import { BUCKET_LABELS, type Bucket } from "./buckets";
import type { ReminderExportRow } from "./queries";

export const REMINDER_EXPORT_COLUMNS: ExportColumn<ReminderExportRow>[] = [
  { header: "Folio", width: 11, value: (r) => formatCode("client", r.clientCode) },
  { header: "Cliente", width: 26, value: (r) => r.clientName },
  { header: "Teléfono", width: 13, value: (r) => r.clientPhone },
  { header: "Fecha compromiso", width: 13, kind: "day", value: (r) => r.targetDate },
  { header: "Hora", width: 7, value: (r) => r.targetTime },
  { header: "Prioridad", width: 9, value: (r) => (r.priority === "ALTA" ? "Alta" : "Normal") },
  { header: "Pedido", width: 48, value: (r) => r.note },
  { header: "Estado", width: 12, value: (r) => (r.isCompleted ? "Completado" : "Pendiente") },
  { header: "Completado", width: 17, value: (r) => r.completedAt },
  { header: "Completó", width: 14, value: (r) => r.completedByName },
  { header: "Capturó", width: 14, value: (r) => r.createdByName },
  { header: "Capturado", width: 17, value: (r) => r.createdAt },
];

/** "recordatorios_manana_2026-10-04" / "recordatorios_busqueda_2026-10-04" */
export function remindersFileName(bucket: Bucket, q: string, now: Date = new Date()): string {
  return `recordatorios_${q ? "busqueda" : bucket}_${getToday(now)}`;
}

export function remindersTitle(bucket: Bucket, q: string): string {
  if (q) return `Recordatorios · búsqueda «${q}»`;
  return `Recordatorios · ${BUCKET_LABELS[bucket]}${bucket === "manana" ? " y más adelante" : ""}`;
}
