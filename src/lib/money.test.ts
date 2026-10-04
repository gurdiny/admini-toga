import { describe, expect, it } from "vitest";
import { formatMoney, formatMXN, moneyToString, parseMoney, sumDecimals, toDecimal, toMXN } from "./money";

describe("parseMoney", () => {
  it("acepta formatos comunes de captura", () => {
    expect(parseMoney("1250")?.toFixed(2)).toBe("1250.00");
    expect(parseMoney("1,250.5")?.toFixed(2)).toBe("1250.50");
    expect(parseMoney("$ 12 850.00")?.toFixed(2)).toBe("12850.00");
  });

  it("rechaza texto, más de 2 decimales y negativos", () => {
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("12.345")).toBeNull();
    expect(parseMoney("1.2.3")).toBeNull();
    expect(parseMoney("-50")).toBeNull();
  });
});

describe("sumas exactas", () => {
  it("0.1 + 0.2 = 0.30 (con number daría 0.30000000000000004)", () => {
    expect(sumDecimals(["0.10", "0.20"]).toFixed(2)).toBe("0.30");
  });

  it("suma muchos centavos sin perder ninguno", () => {
    expect(sumDecimals(Array(1000).fill("0.01")).toFixed(2)).toBe("10.00");
  });

  it("toDecimal lanza con montos inválidos", () => {
    expect(() => toDecimal("doce")).toThrow();
    expect(() => toDecimal(Number.NaN)).toThrow();
  });
});

describe("formato", () => {
  it("pesos mexicanos", () => {
    expect(formatMXN("12850")).toBe("$12,850.00");
    expect(formatMXN(toDecimal("1450.5"))).toBe("$1,450.50");
  });

  it("otras monedas muestran su código", () => {
    expect(formatMoney("1200", "USD").replace(/\s/g, " ")).toBe("USD 1,200.00");
  });

  it("moneyToString para pasar al cliente", () => {
    expect(moneyToString("14299.5")).toBe("14299.50");
  });
});

describe("toMXN", () => {
  it("pesos se quedan igual", () => {
    expect(toMXN({ amount: "1250.50", currency: "MXN", exchangeRate: null }).toFixed(2)).toBe("1250.50");
  });
  it("dólares × tipo de cambio, al centavo", () => {
    expect(toMXN({ amount: "100.00", currency: "USD", exchangeRate: "17.3456" }).toFixed(2)).toBe("1734.56");
  });
  it("sin tipo de cambio cuenta 1 a 1", () => {
    expect(toMXN({ amount: "10.00", currency: "USD", exchangeRate: null }).toFixed(2)).toBe("10.00");
  });
});
