// Exportar listados a CSV y Excel. Las columnas se describen una vez y sirven
// para los dos formatos. Sin dependencias de servidor salvo exceljs, que se
// carga solo al generar un .xlsx.
//
// - Días (DayKey): en Excel son fechas reales (se pueden ordenar y filtrar) con
//   formato dd/mm/aaaa; en CSV, texto "04/10/2026".
// - Dinero: string "1250.50" (de moneyToString). En Excel se vuelve número con
//   formato de pesos solo al escribir la celda; las sumas se hacen antes con Decimal.
// - Instantes: ya vienen como texto en hora de México ("04/10/2026 13:03").

import { dayToDb, type DayKey } from "@/lib/date";
import { sumDecimals } from "@/lib/money";

export type ExportFormat = "xlsx" | "csv";

export type ExportColumn<T> = {
  header: string;
  /** Ancho en Excel (caracteres). */
  width?: number;
  kind?: "text" | "day" | "money" | "number";
  value: (row: T) => string | number | null;
};

export function parseExportFormat(value: string | null): ExportFormat {
  return value === "csv" ? "csv" : "xlsx";
}

/** "2026-10-04" → "04/10/2026" (como se lee en México). */
export function dayToText(day: DayKey): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

// ─── CSV ───────────────────────────────────────────────────────────────────

function csvCell(value: string): string {
  // Fórmulas: un texto que empieza con = + - @ se abriría como fórmula en Excel.
  const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * CSV con BOM (Excel en Windows reconoce los acentos), coma como separador y
 * saltos de línea CRLF. Montos sin separador de miles: "1250.50".
 */
export function toCsv<T>(columns: ExportColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(",")];
  for (const row of rows) {
    lines.push(
      columns
        .map((c) => {
          const value = c.value(row);
          if (value === null || value === "") return "";
          if (c.kind === "day") return dayToText(value as DayKey);
          return csvCell(String(value));
        })
        .join(","),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

// ─── Excel ─────────────────────────────────────────────────────────────────

const MONEY_FORMAT = '"$"#,##0.00';
const BRAND = "FFC23D73"; // rosa TOGA

type XlsxOptions = {
  sheetName: string;
  /** Primera fila: título del reporte («Pagos a proveedores · 1–31 oct 2026»). */
  title: string;
  /** Columnas de dinero que llevan total al final (por encabezado). */
  totals?: string[];
};

export async function toXlsx<T>(columns: ExportColumn<T>[], rows: T[], { sheetName, title, totals = [] }: XlsxOptions): Promise<Buffer> {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "TOGA";
  book.created = new Date();
  const sheet = book.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 2 }] });

  sheet.columns = columns.map((c) => ({ width: c.width ?? 16 }));
  const titleRow = sheet.addRow([title]);
  titleRow.font = { bold: true, size: 14 };
  sheet.mergeCells(1, 1, 1, columns.length);

  const header = sheet.addRow(columns.map((c) => c.header));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  header.alignment = { vertical: "middle" };
  header.height = 20;

  for (const row of rows) {
    sheet.addRow(
      columns.map((c) => {
        const value = c.value(row);
        if (value === null || value === "") return null;
        // Medianoche UTC del día de México: exceljs escribe en UTC, así se ve el mismo día.
        if (c.kind === "day") return dayToDb(value as DayKey);
        // Conversión solo para la celda: el total ya se sumó con Decimal.
        if (c.kind === "money" || c.kind === "number") return Number(value);
        return value;
      }),
    );
  }

  columns.forEach((c, i) => {
    const column = sheet.getColumn(i + 1);
    if (c.kind === "day") column.numFmt = "dd/mm/yyyy";
    if (c.kind === "money") column.numFmt = MONEY_FORMAT;
  });

  if (totals.length && rows.length) {
    const first = 3;
    const last = rows.length + 2;
    const totalRow = sheet.addRow(columns.map((_, i) => (i === 0 ? "Total" : null)));
    totalRow.font = { bold: true };
    columns.forEach((c, i) => {
      if (!totals.includes(c.header)) return;
      const letter = sheet.getColumn(i + 1).letter;
      // Fórmula (se actualiza si el contador edita) con el resultado ya calculado con Decimal.
      const result = sumDecimals(rows.map((row) => String(c.value(row) ?? "0"))).toNumber();
      totalRow.getCell(i + 1).value = { formula: `SUM(${letter}${first}:${letter}${last})`, result };
    });
    totalRow.border = { top: { style: "thin" } };
  }

  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: columns.length } };
  return Buffer.from(await book.xlsx.writeBuffer());
}

// ─── Respuesta ─────────────────────────────────────────────────────────────

/** Arma la descarga del archivo en el formato pedido. `baseName` sin extensión. */
export async function exportResponse<T>(
  format: ExportFormat,
  baseName: string,
  columns: ExportColumn<T>[],
  rows: T[],
  options: XlsxOptions,
): Promise<Response> {
  const body = format === "csv" ? toCsv(columns, rows) : new Uint8Array(await toXlsx(columns, rows, options));
  const type = format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const filename = `${baseName}.${format}`;
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
