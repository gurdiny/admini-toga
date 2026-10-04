import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { DayKey } from "./date";
import { dayToText, parseExportFormat, toCsv, toXlsx, type ExportColumn } from "./export";

type Row = { day: DayKey; name: string; amount: string };
const columns: ExportColumn<Row>[] = [
  { header: "Fecha", kind: "day", value: (r) => r.day },
  { header: "Concepto", value: (r) => r.name },
  { header: "Monto", kind: "money", value: (r) => r.amount },
];
const rows: Row[] = [
  { day: "2026-10-01", name: "Anillos de plata, talla 7", amount: "1250.50" },
  { day: "2026-10-31", name: 'Dije "corazón"', amount: "0.10" },
  { day: "2026-10-31", name: "=HYPERLINK(\"x\")", amount: "0.20" },
];

describe("exportar", () => {
  it("formato por defecto es Excel", () => {
    expect(parseExportFormat(null)).toBe("xlsx");
    expect(parseExportFormat("csv")).toBe("csv");
    expect(parseExportFormat("pdf")).toBe("xlsx");
  });

  it("días legibles en México", () => {
    expect(dayToText("2026-10-04")).toBe("04/10/2026");
  });

  it("CSV con BOM, comillas y sin fórmulas", () => {
    const csv = toCsv(columns, rows);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe("Fecha,Concepto,Monto");
    expect(lines[1]).toBe('01/10/2026,"Anillos de plata, talla 7",1250.50');
    expect(lines[2]).toBe('31/10/2026,"Dije ""corazón""",0.10');
    // Un texto que empieza con «=» no se abre como fórmula.
    expect(lines[3].split(",")[1].startsWith('"\'=')).toBe(true);
  });

  it("Excel: fechas reales, montos numéricos y total exacto", async () => {
    const buffer = await toXlsx(columns, rows, { sheetName: "Pagos", title: "Prueba", totals: ["Monto"] });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = book.getWorksheet("Pagos")!;
    expect(sheet.getCell("A1").value).toBe("Prueba");
    expect(sheet.getCell("A2").value).toBe("Fecha");
    // Fila 3 = primer dato: el día no se corre por la zona horaria.
    const day = sheet.getCell("A3").value as Date;
    expect(day.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(sheet.getCell("C3").value).toBe(1250.5);
    // 0.10 + 0.20 + 1250.50 con Decimal: 1250.80 exacto.
    const total = sheet.getCell("C6").value as { formula: string; result: number };
    expect(total.formula).toBe("SUM(C3:C5)");
    expect(total.result).toBe(1250.8);
  });
});
