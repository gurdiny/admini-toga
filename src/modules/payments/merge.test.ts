import { describe, expect, it } from "vitest";
import { compareMergeKeys, mergeSorted, type MergeKey } from "./merge";

type Row = MergeKey & { id: string };
const row = (id: string, date: string, time: string, amount = "100.00"): Row => ({ id, date: date as Row["date"], time, amount });
const key = { first: (r: Row) => r, second: (r: Row) => r };
const ids = (list: { item: Row }[]) => list.map((entry) => entry.item.id);

describe("compareMergeKeys", () => {
  it("ordena por día y luego por hora", () => {
    const a = row("a", "2026-11-10", "09:00");
    const b = row("b", "2026-11-10", "17:30");
    const c = row("c", "2026-11-11", "08:00");
    expect(compareMergeKeys(c, b, "date", "desc")).toBeLessThan(0);
    expect(compareMergeKeys(b, a, "date", "desc")).toBeLessThan(0);
    expect(compareMergeKeys(a, b, "date", "asc")).toBeLessThan(0);
  });

  it("compara montos como Decimal, no como texto", () => {
    expect(compareMergeKeys(row("a", "2026-11-10", "09:00", "900.00"), row("b", "2026-11-10", "09:00", "1000.00"), "amount", "desc")).toBeGreaterThan(0);
  });

  it("con el mismo monto, el más reciente va primero aunque sea ascendente", () => {
    const old = row("old", "2026-11-01", "09:00", "50.00");
    const recent = row("new", "2026-11-05", "09:00", "50.00");
    expect(compareMergeKeys(recent, old, "amount", "asc")).toBeLessThan(0);
  });
});

describe("mergeSorted", () => {
  const suppliers = [row("s1", "2026-11-12", "18:00"), row("s2", "2026-11-12", "10:00"), row("s3", "2026-11-10", "12:00")];
  const others = [row("o1", "2026-11-12", "12:00"), row("o2", "2026-11-11", "09:00"), row("o3", "2026-11-09", "09:00")];

  it("intercala las dos listas por fecha y hora", () => {
    expect(ids(mergeSorted(suppliers, others, key, "date", "desc", 0, 10))).toEqual(["s1", "o1", "s2", "o2", "s3", "o3"]);
  });

  it("las páginas no se enciman ni se saltan registros", () => {
    const all = ids(mergeSorted(suppliers, others, key, "date", "desc", 0, 10));
    const pages = [0, 2, 4].flatMap((skip) =>
      // Cada página solo recibe las primeras skip + take filas de cada tabla, como en la consulta.
      ids(mergeSorted(suppliers.slice(0, skip + 2), others.slice(0, skip + 2), key, "date", "desc", skip, 2)),
    );
    expect(pages).toEqual(all);
  });

  it("si una lista está vacía devuelve la otra", () => {
    expect(ids(mergeSorted([], others, key, "date", "desc", 0, 10))).toEqual(["o1", "o2", "o3"]);
    expect(ids(mergeSorted(suppliers, [], key, "date", "desc", 1, 1))).toEqual(["s2"]);
  });

  it("marca de qué lista viene cada renglón", () => {
    const merged = mergeSorted(suppliers, others, key, "date", "desc", 0, 2);
    expect(merged.map((entry) => entry.from)).toEqual(["first", "second"]);
  });
});
