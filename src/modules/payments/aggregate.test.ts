import { describe, expect, it } from "vitest";
import {
  isSplitSettled,
  splitsByCurrency,
  subtractSplit,
  sumSplits,
  summarizePayments,
  supplierBalances,
  toSplit,
  totalBalances,
  type PaymentForSummary,
} from "./aggregate";

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

describe("los dos renglones de la nota", () => {
  const nota = toSplit("20000", "5000");

  it("el total es la suma de los dos renglones", () => {
    expect(nota).toEqual({ metal: "20000.00", labor: "5000.00", total: "25000.00" });
  });

  it("suma los abonos renglón por renglón", () => {
    const abonos = sumSplits([
      { amountMetal: "15000", amountLabor: "3500" },
      { amountMetal: "3000", amountLabor: "0" },
    ]);
    expect(abonos).toEqual({ metal: "18000.00", labor: "3500.00", total: "21500.00" });
  });

  it("el metal no paga la hechura: cada mitad lleva su saldo", () => {
    const abonos = sumSplits([{ amountMetal: "20000", amountLabor: "0" }]);
    const falta = subtractSplit(nota, abonos);
    expect(falta).toEqual({ metal: "0.00", labor: "5000.00", total: "5000.00" });
    expect(isSplitSettled(falta)).toBe(false);
  });

  it("la nota se liquida solo cuando los dos renglones quedan en cero", () => {
    expect(isSplitSettled(subtractSplit(nota, sumSplits([{ amountMetal: "20000", amountLabor: "5000" }])))).toBe(true);
  });

  it("no mezcla monedas y omite los saldos en cero", () => {
    const saldos = splitsByCurrency([
      { currency: "MXN", balance: toSplit("1000", "200") },
      { currency: "MXN", balance: toSplit("500", "0") },
      { currency: "USD", balance: toSplit("0", "80") },
      { currency: "MXN", balance: toSplit("0", "0") },
    ]);
    expect(saldos).toEqual({
      MXN: { metal: "1500.00", labor: "200.00", total: "1700.00" },
      USD: { metal: "0.00", labor: "80.00", total: "80.00" },
    });
  });

  it("centavos: tres abonos de un tercio no pierden ni un centavo", () => {
    const abonos = sumSplits([
      { amountMetal: "0.33", amountLabor: "0.01" },
      { amountMetal: "0.33", amountLabor: "0.01" },
      { amountMetal: "0.34", amountLabor: "0.01" },
    ]);
    expect(abonos).toEqual({ metal: "1.00", labor: "0.03", total: "1.03" });
  });
});
