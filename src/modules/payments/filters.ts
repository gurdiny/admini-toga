// Filtros de /pagos en la URL (?ver=todos&rango=semana&q=anillo&orden=amount&dir=asc&pagina=2).
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

/**
 * Qué lista se ve: pagos a proveedores (sin parámetro), pagos sin proveedor
 * o todos juntos.
 */
export const PAYMENT_VIEWS = ["proveedores", "sin-proveedor", "todos"] as const;
export type PaymentView = (typeof PAYMENT_VIEWS)[number];

export const PAYMENT_VIEW_LABELS: Record<PaymentView, { title: string; short: string }> = {
  proveedores: { title: "Pagos a proveedores", short: "A proveedores" },
  "sin-proveedor": { title: "Pagos sin proveedor", short: "Sin proveedor" },
  todos: { title: "Todos los pagos", short: "Todos" },
};

/** URL de cada lista, sin más filtros (menú de «Pagos» en la barra de abajo). */
export const viewHref = (view: PaymentView) => (view === "proveedores" ? "/pagos" : `/pagos?ver=${view}`);

export type PaymentPageFilters = {
  ver: PaymentView;
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

  const ver = (PAYMENT_VIEWS as readonly string[]).includes(one(params.ver)) ? (one(params.ver) as PaymentView) : "proveedores";
  let orden = (SORTS as readonly string[]).includes(one(params.orden)) ? (one(params.orden) as SortParam) : "date";
  // Sin proveedor (o mezclado) no hay orden por proveedor.
  if (orden === "supplier" && ver !== "proveedores") orden = "date";
  const dir = one(params.dir) === "asc" ? "asc" : "desc";
  const pagina = Math.max(1, Number.parseInt(one(params.pagina), 10) || 1);

  return { ver, rango, range, q: one(params.q).trim(), orden, dir, pagina };
}

/** Construye la URL de /pagos cambiando solo algunos filtros. */
export function paymentsHref(filters: PaymentPageFilters, changes: Partial<Record<string, string | number | null>>) {
  const params = new URLSearchParams();
  const base: Record<string, string | number | null> = {
    ver: filters.ver === "proveedores" ? null : filters.ver,
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
