// Sumas de pagos y saldos, sin tocar la base: las consultas de queries.ts
// traen los renglones y aquí se agregan con Decimal. Separado para poder
// probarlo (aggregate.test.ts): un centavo perdido en un total no se nota a simple vista.
import { moneyToString, toDecimal, toMXN, ZERO, type Decimal, type MoneyInput } from "@/lib/money";

/** Saldos por moneda: { MXN: "14299.50" }. Normalmente solo MXN. */
export type Balances = Record<string, string>;

export type BreakdownRow = { id: string; name: string; color?: string; total: string; count: number };

function addTo(map: Map<string, Decimal>, key: string, amount: Decimal) {
  map.set(key, (map.get(key) ?? ZERO).add(amount));
}

/** Saldos en cero no se muestran. */
function toBalances(map: Map<string, Decimal>): Balances {
  const out: Balances = {};
  for (const [currency, amount] of map) if (!amount.isZero()) out[currency] = moneyToString(amount);
  return out;
}

// ─── Los dos renglones de la nota ──────────────────────────────────────────
// Metal y hechura se suman por separado y nunca se compensan entre sí: el
// total es solo la suma de los dos, calculado con Decimal.

/** Metal, mano de obra y su total, como texto para pasar al cliente. */
export type Split = { metal: string; labor: string; total: string };

/** Una fila de la base (nota o pago) con sus dos renglones. */
export type SplitRow = { amountMetal: MoneyInput; amountLabor: MoneyInput };

export const ZERO_SPLIT: Split = { metal: "0.00", labor: "0.00", total: "0.00" };

export function toSplit(metal: MoneyInput, labor: MoneyInput): Split {
  const m = toDecimal(metal);
  const l = toDecimal(labor);
  return { metal: moneyToString(m), labor: moneyToString(l), total: moneyToString(m.add(l)) };
}

/** Suma renglón por renglón: los abonos de una nota, las notas de un proveedor. */
export function sumSplits(rows: readonly SplitRow[]): Split {
  let metal = ZERO;
  let labor = ZERO;
  for (const row of rows) {
    metal = metal.add(toDecimal(row.amountMetal));
    labor = labor.add(toDecimal(row.amountLabor));
  }
  return toSplit(metal, labor);
}

/** Lo que falta de una nota: su monto menos lo abonado, renglón por renglón. */
export function subtractSplit(total: Split, paid: Split): Split {
  return toSplit(toDecimal(total.metal).sub(paid.metal), toDecimal(total.labor).sub(paid.labor));
}

/** Una nota está liquidada cuando ninguno de sus dos renglones debe nada. */
export function isSplitSettled(balance: Split): boolean {
  return toDecimal(balance.metal).lte(0) && toDecimal(balance.labor).lte(0);
}

/**
 * Saldo por renglón agrupado por moneda: nunca se mezclan pesos con dólares.
 * Los saldos en cero no aparecen.
 */
export function splitsByCurrency(rows: readonly { currency: string; balance: Split }[]): Record<string, Split> {
  const byCurrency = new Map<string, { metal: Decimal; labor: Decimal }>();
  for (const row of rows) {
    const sums = byCurrency.get(row.currency) ?? { metal: ZERO, labor: ZERO };
    byCurrency.set(row.currency, {
      metal: sums.metal.add(toDecimal(row.balance.metal)),
      labor: sums.labor.add(toDecimal(row.balance.labor)),
    });
  }
  const out: Record<string, Split> = {};
  for (const [currency, sums] of byCurrency) {
    if (sums.metal.isZero() && sums.labor.isZero()) continue;
    out[currency] = toSplit(sums.metal, sums.labor);
  }
  return out;
}

/** Un renglón de `groupBy` por proveedor y moneda. */
export type SupplierSum = { supplierId: string; currency: string; amount: MoneyInput | null };

/**
 * Saldo por proveedor y moneda: adeudos − abonos (ya filtrados por
 * `deletedAt: null`). Solo quedan los proveedores que deben algo.
 */
export function supplierBalances(debts: readonly SupplierSum[], paid: readonly SupplierSum[]): Map<string, Balances> {
  const bySupplier = new Map<string, Map<string, Decimal>>();
  const bucket = (id: string) => bySupplier.get(id) ?? bySupplier.set(id, new Map()).get(id)!;
  for (const row of debts) addTo(bucket(row.supplierId), row.currency, toDecimal(row.amount ?? ZERO));
  for (const row of paid) addTo(bucket(row.supplierId), row.currency, toDecimal(row.amount ?? ZERO).neg());

  const result = new Map<string, Balances>();
  for (const [id, map] of bySupplier) {
    const balances = toBalances(map);
    if (Object.keys(balances).length) result.set(id, balances);
  }
  return result;
}

/** Suma de saldos de varios proveedores, por moneda (nunca mezcla monedas). */
export function totalBalances(balances: Iterable<Balances>): Balances {
  const owed = new Map<string, Decimal>();
  for (const supplier of balances) {
    for (const [currency, amount] of Object.entries(supplier)) addTo(owed, currency, toDecimal(amount));
  }
  return toBalances(owed);
}

type Named = { id: string; name: string; color?: string };
export type PaymentForSummary = {
  amount: MoneyInput;
  currency: string;
  exchangeRate: MoneyInput | null;
  supplier: Named;
  category: Named;
};

/**
 * Total pagado en pesos (otras monedas × su tipo de cambio) y desglose por
 * proveedor y por categoría, de mayor a menor.
 */
export function summarizePayments(payments: readonly PaymentForSummary[]) {
  let total = ZERO;
  const bySupplier = new Map<string, Named & { sum: Decimal; count: number }>();
  const byCategory = new Map<string, Named & { sum: Decimal; count: number }>();
  for (const p of payments) {
    const mxn = toMXN(p);
    total = total.add(mxn);
    for (const [map, item] of [
      [bySupplier, p.supplier],
      [byCategory, p.category],
    ] as const) {
      const row = map.get(item.id) ?? { ...item, sum: ZERO, count: 0 };
      row.sum = row.sum.add(mxn);
      row.count += 1;
      map.set(item.id, row);
    }
  }

  const finish = (map: Map<string, Named & { sum: Decimal; count: number }>): BreakdownRow[] =>
    [...map.values()].sort((a, b) => b.sum.comparedTo(a.sum)).map(({ sum, ...row }) => ({ ...row, total: moneyToString(sum) }));

  const suppliers = finish(bySupplier);
  return {
    totalPaid: moneyToString(total),
    count: payments.length,
    topSupplier: suppliers[0] ? { name: suppliers[0].name, total: suppliers[0].total } : null,
    bySupplier: suppliers,
    byCategory: finish(byCategory),
  };
}
