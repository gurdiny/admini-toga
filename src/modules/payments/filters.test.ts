import { describe, expect, it } from "vitest";
import { parsePaymentFilters, paymentsHref } from "./filters";

const sunday = new Date("2026-10-04T21:00:00-06:00");

describe("filtros de /pagos en la URL", () => {
  it("por defecto: esta semana, más recientes primero", () => {
    expect(parsePaymentFilters({}, sunday)).toMatchObject({
      rango: "semana",
      range: { from: "2026-09-28", to: "2026-10-04" },
      orden: "date",
      dir: "desc",
      pagina: 1,
    });
  });

  it("hoy y este mes", () => {
    expect(parsePaymentFilters({ rango: "hoy" }, sunday).range).toEqual({ from: "2026-10-04", to: "2026-10-04" });
    expect(parsePaymentFilters({ rango: "mes" }, sunday).range).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("personalizado, y si las fechas vienen al revés se acomodan", () => {
    const f = parsePaymentFilters({ rango: "personalizado", desde: "2026-09-30", hasta: "2026-09-01" }, sunday);
    expect(f).toMatchObject({ rango: "personalizado", range: { from: "2026-09-01", to: "2026-09-30" } });
  });

  it("valores inválidos caen en los de por defecto", () => {
    const f = parsePaymentFilters({ rango: "ayer", orden: "drop table", pagina: "-3", desde: "x" }, sunday);
    expect(f).toMatchObject({ rango: "semana", orden: "date", pagina: 1 });
  });

  it("la URL solo lleva lo que no es por defecto", () => {
    const f = parsePaymentFilters({ rango: "mes" }, sunday);
    expect(paymentsHref(f, {})).toBe("/pagos?rango=mes");
    expect(paymentsHref(f, { orden: "amount", dir: "asc", pagina: 2 })).toBe("/pagos?rango=mes&orden=amount&dir=asc&pagina=2");
  });
});
