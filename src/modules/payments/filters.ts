// Filtros de /pagos en la URL (?rango=semana&q=oro&orden=amount&dir=asc&pagina=2).
// Así el filtro sobrevive a recargar la página y se puede compartir el enlace.

import { getRange, isDayKey, type DayKey, type DayRange } from "@/lib/date";

export const RANGE_PRESETS = {
  hoy: "today",
  semana: "week",
  mes: "month",
} as const;

export type RangeParam = keyof typeof RANGE_PRESETS | "personalizado";
export const SORTS = ["date", "amount", "supplier"] as const;
export type SortParam = (typeof SORTS)[number];

export type PaymentPageFilters = {
  rango: RangeParam;
  range: DayRange;
  q: string;
  orden: SortParam;
  dir: "asc" | "desc";
  pagina: number;
};

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export function parsePaymentFilters(params: Params, now = new Date()): PaymentPageFilters {
  const rangoParam = one(params.rango);
  const desde = one(params.desde);
  const hasta = one(params.hasta);

  let rango: RangeParam = rangoParam in RANGE_PRESETS ? (rangoParam as RangeParam) : "semana";
  let range: DayRange = getRange(RANGE_PRESETS[rango as keyof typeof RANGE_PRESETS] ?? "week", now);
  if (rangoParam === "personalizado" && isDayKey(desde) && isDayKey(hasta)) {
    rango = "personalizado";
    // Si vienen al revés, se acomodan.
    range = desde <= hasta ? { from: desde as DayKey, to: hasta as DayKey } : { from: hasta as DayKey, to: desde as DayKey };
  }

  const orden = (SORTS as readonly string[]).includes(one(params.orden)) ? (one(params.orden) as SortParam) : "date";
  const dir = one(params.dir) === "asc" ? "asc" : "desc";
  const pagina = Math.max(1, Number.parseInt(one(params.pagina), 10) || 1);

  return { rango, range, q: one(params.q).trim(), orden, dir, pagina };
}

/** Construye la URL de /pagos cambiando solo algunos filtros. */
export function paymentsHref(filters: PaymentPageFilters, changes: Partial<Record<string, string | number | null>>) {
  const params = new URLSearchParams();
  const base: Record<string, string | number | null> = {
    rango: filters.rango,
    desde: filters.rango === "personalizado" ? filters.range.from : null,
    hasta: filters.rango === "personalizado" ? filters.range.to : null,
    q: filters.q || null,
    orden: filters.orden === "date" ? null : filters.orden,
    dir: filters.dir === "desc" ? null : filters.dir,
    pagina: filters.pagina > 1 ? filters.pagina : null,
    ...changes,
  };
  for (const [key, value] of Object.entries(base)) {
    if (value !== null && value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `/pagos?${query}` : "/pagos";
}
