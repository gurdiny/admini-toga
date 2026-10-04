// Dinero siempre como Decimal, nunca como number: 0.1 + 0.2 !== 0.3 en
// JavaScript, y en una suma de cientos de pagos el centavo perdido aparece.
//
// Funciona en servidor y en navegador (usa la versión "browser" de Prisma).
// Un Decimal no se puede pasar de un Server Component a un Client Component:
// convertirlo antes con moneyToString().

import { Prisma } from "@/generated/prisma/browser";

export const Decimal = Prisma.Decimal;
export type Decimal = InstanceType<typeof Prisma.Decimal>;
export type MoneyInput = Decimal | string | number;

export const ZERO = new Decimal(0);

// "1234", "1,234.5", "$ 1 234.50" → sí. "12.345", "1.2.3", "abc", "" → no.
const MONEY_RE = /^\d+(\.\d{1,2})?$/;

/**
 * Convierte texto capturado a Decimal. Quita "$", comas y espacios.
 * Devuelve null si no es un monto válido o tiene más de 2 decimales
 * (mejor rechazar que redondear en silencio).
 */
export function parseMoney(input: string): Decimal | null {
  const clean = input.replace(/[$,\s]/g, "");
  return MONEY_RE.test(clean) ? new Decimal(clean) : null;
}

/** Convierte a Decimal. Lanza si el valor no es un monto válido. */
export function toDecimal(value: MoneyInput): Decimal {
  if (Decimal.isDecimal(value)) return new Decimal(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Monto inválido: ${value}`);
    return new Decimal(value);
  }
  const parsed = parseMoney(value);
  if (!parsed) throw new Error(`Monto inválido: "${value}"`);
  return parsed;
}

export function sumDecimals(values: readonly MoneyInput[]): Decimal {
  return values.reduce<Decimal>((total, value) => total.add(toDecimal(value)), ZERO);
}

/** Para pasar a Client Components o guardar en JSON: "12850.00". */
export function moneyToString(value: MoneyInput): string {
  return toDecimal(value).toFixed(2);
}

const formatters = new Map<string, Intl.NumberFormat>();

/** "$12,850.00". Con otra moneda: "USD 1,200.00". */
export function formatMoney(value: MoneyInput, currency = "MXN"): string {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      currencyDisplay: currency === "MXN" ? "narrowSymbol" : "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatters.set(currency, formatter);
  }
  // toNumber() es exacto para mostrar montos de hasta 13 dígitos.
  return formatter.format(toDecimal(value).toNumber());
}

export function formatMXN(value: MoneyInput): string {
  return formatMoney(value, "MXN");
}
