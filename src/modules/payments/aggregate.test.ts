import { describe, expect, it } from "vitest";
import { summarizePayments, supplierBalances, totalBalances, type PaymentForSummary } from "./aggregate";

const taxco = { id: "s1", name: "Platería Taxco" };
const engaste = { id: "s2", name: "Taller de Engaste" };
const anillos = { id: "c1", name: "Anillos", color: "#c23d73" };
const manoDeObra = { id: "c2", name: "Mano de obra", color: "#aa3a3e" };

const pago = (amount: string, supplier = taxco, category = anillos, currency = "MXN", exchangeRate: string | null = null): PaymentForSummary => ({
  amount,
  currency,
  exchangeRate,
  supplier,
  category,
});

describe("total pagado y desglose", () => {
  it("sin pagos: cero y sin proveedor principal", () => {
    expect(summarizePayments([])).toEqual({ totalPaid: "0.00", count: 0, topSupplier: null, bySupplier: [], byCategory: [] });
  });

  it("no pierde centavos al sumar muchos montos (0.1 + 0.2 ≠ 0.3 con number)", () => {
    const payments = Array.from({ length: 1000 }, () => pago("0.10"));
    payments.push(pago("0.20"));
    expect(summarizePayments(payments).totalPaid).toBe("100.20");
  });

  it("otra moneda cuenta en pesos con su tipo de cambio, al centavo", () => {
    // 100 USD × 17.2345 = 1723.45; 33.33 USD × 18.1234 = 604.0529… → 604.05
    const summary = summarizePayments([pago("1000.00"), pago("100.00", taxco, anillos, "USD", "17.2345"), pago("33.33", taxco, anillos, "USD", "18.1234")]);
    expect(summary.totalPaid).toBe("3327.50");
  });

  it("desglosa por proveedor y por categoría, de mayor a menor, con cuántos pagos", () => {
    const summary = summarizePayments([
      pago("500.00", engaste, manoDeObra),
      pago("1450.50", taxco, anillos),
      pago("800.00", engaste, manoDeObra),
      pago("120.25", taxco, manoDeObra),
    ]);
    expect(summary.totalPaid).toBe("2870.75");
    expect(summary.count).toBe(4);
    expect(summary.bySupplier).toEqual([
      { ...taxco, total: "1570.75", count: 2 },
      { ...engaste, total: "1300.00", count: 2 },
    ]);
    expect(summary.byCategory).toEqual([
      { ...anillos, total: "1450.50", count: 1 },
      { ...manoDeObra, total: "1420.25", count: 3 },
    ]);
    expect(summary.topSupplier).toEqual({ name: "Platería Taxco", total: "1570.75" });
  });

  it("los desgloses suman lo mismo que el total", () => {
    const summary = summarizePayments([pago("10.01"), pago("20.02", engaste, manoDeObra), pago("5.00", engaste, anillos, "USD", "17.5")]);
    const sum = (rows: { total: string }[]) => rows.reduce((cents, r) => cents + Math.round(Number(r.total) * 100), 0);
    expect(sum(summary.bySupplier)).toBe(Math.round(Number(summary.totalPaid) * 100));
    expect(sum(summary.byCategory)).toBe(Math.round(Number(summary.totalPaid) * 100));
  });
});

describe("saldos con proveedores", () => {
  it("adeudos − abonos por proveedor; el que ya liquidó no aparece", () => {
    const balances = supplierBalances(
      [
        { supplierId: "s1", currency: "MXN", amount: "50000.00" },
        { supplierId: "s2", currency: "MXN", amount: "950.00" },
      ],
      [
        { supplierId: "s1", currency: "MXN", amount: "35700.50" },
        { supplierId: "s2", currency: "MXN", amount: "950.00" },
      ],
    );
    expect(Object.fromEntries(balances)).toEqual({ s1: { MXN: "14299.50" } });
  });

  it("cada moneda por separado; sin abonos (suma nula) cuenta el adeudo completo", () => {
    const balances = supplierBalances(
      [
        { supplierId: "s1", currency: "MXN", amount: "1000.00" },
        { supplierId: "s1", currency: "USD", amount: "200.00" },
      ],
      [{ supplierId: "s1", currency: "USD", amount: null }],
    );
    expect(balances.get("s1")).toEqual({ MXN: "1000.00", USD: "200.00" });
  });

  it("total por pagar: suma los saldos de todos, sin mezclar monedas", () => {
    expect(totalBalances([{ MXN: "14299.50" }, { MXN: "0.50", USD: "200.00" }, {}])).toEqual({ MXN: "14300.00", USD: "200.00" });
    expect(totalBalances([])).toEqual({});
  });
});
