// «Todos los pagos» junta dos tablas (pagos a proveedores y pagos sin
// proveedor) en una sola lista paginada. Cada tabla llega ya ordenada desde
// la base; aquí se intercalan con un merge de dos punteros. Así la página N
// solo necesita las primeras N × tamaño filas de cada tabla y las páginas
// nunca se enciman ni se saltan registros. Sin dependencias de servidor:
// se prueba con Vitest (merge.test.ts).

import { toDecimal } from "@/lib/money";
import type { DayKey } from "@/lib/date";

/** Lo mínimo para ordenar un pago de cualquiera de las dos tablas. */
export type MergeKey = {
  date: DayKey;
  /** "HH:mm" o "HH:mm:ss": desempata dentro del mismo día. */
  time: string;
  amount: string;
};

export type MergeSort = "date" | "amount";

/** Negativo si `a` va antes que `b`. */
export function compareMergeKeys(a: MergeKey, b: MergeKey, sort: MergeSort, dir: "asc" | "desc"): number {
  const sign = dir === "asc" ? 1 : -1;
  if (sort === "amount") {
    const byAmount = toDecimal(a.amount).comparedTo(toDecimal(b.amount));
    if (byAmount !== 0) return sign * byAmount;
    // Mismo monto: el más reciente primero, como en cada lista.
    return -compareDateTime(a, b);
  }
  return sign * compareDateTime(a, b);
}

function compareDateTime(a: MergeKey, b: MergeKey): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.time !== b.time) return a.time < b.time ? -1 : 1;
  return 0;
}

/**
 * Intercala dos listas ya ordenadas y devuelve los renglones [skip, skip + take).
 * Con empate gana la primera lista (es estable).
 */
export function mergeSorted<A, B>(
  first: readonly A[],
  second: readonly B[],
  keyOf: { first: (item: A) => MergeKey; second: (item: B) => MergeKey },
  sort: MergeSort,
  dir: "asc" | "desc",
  skip: number,
  take: number,
): ({ from: "first"; item: A } | { from: "second"; item: B })[] {
  const out: ({ from: "first"; item: A } | { from: "second"; item: B })[] = [];
  let i = 0;
  let j = 0;
  while (out.length < skip + take && (i < first.length || j < second.length)) {
    const takeFirst =
      j >= second.length || (i < first.length && compareMergeKeys(keyOf.first(first[i]), keyOf.second(second[j]), sort, dir) <= 0);
    if (takeFirst) out.push({ from: "first", item: first[i++] });
    else out.push({ from: "second", item: second[j++] });
  }
  return out.slice(skip);
}
