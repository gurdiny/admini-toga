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
