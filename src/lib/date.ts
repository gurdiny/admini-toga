// Fechas en zona horaria de México.
//
// Hay dos tipos de fecha en la base, y no se mezclan:
//
// 1. Día calendario (`@db.Date`: SupplierPayment.date, SupplierDebt.date,
//    OrderReminder.targetDate). Es "el 4 de octubre", sin hora. Se guarda como
//    medianoche UTC de ese día y en el código se maneja como texto "yyyy-MM-dd"
//    (tipo `DayKey`). Para leer/escribir la base: dayToDb() y dbToDay().
//
// 2. Instante (`DateTime`: createdAt, completedAt, deletedAt). Es un momento
//    exacto, guardado en UTC. Para filtrar por día de México:
//    startOfDayInTZ() y endOfDayInTZ().
//
// Regla: "hoy" siempre es el día de México, nunca el de UTC. A las 23:00 de
// México ya es mañana en UTC; por eso nada debe usar new Date() para decidir
// qué día es.

import { es } from "date-fns/locale";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/Mexico_City";

/** Día calendario como texto: "2026-10-04". */
export type DayKey = `${number}-${number}-${number}`;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(value: string): value is DayKey {
  if (!DAY_KEY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// ─── Día de México ─────────────────────────────────────────────────────────

/** Día de México que corresponde a un instante (por defecto, ahora). */
export function dayInTZ(instant: Date = new Date()): DayKey {
  return formatInTimeZone(instant, APP_TIMEZONE, "yyyy-MM-dd") as DayKey;
}

/** Hoy en México. */
export function getToday(now: Date = new Date()): DayKey {
  return dayInTZ(now);
}

/** Mañana en México. */
export function getTomorrow(now: Date = new Date()): DayKey {
  return addDays(getToday(now), 1);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Suma (o resta) días a un día calendario. Aritmética pura en UTC: no depende
 * de la zona horaria de la máquina ni de cambios de horario.
 */
export function addDays(day: DayKey, amount: number): DayKey {
  return dbToDay(new Date(dayToDb(day).getTime() + amount * DAY_MS));
}

// ─── Columnas @db.Date ─────────────────────────────────────────────────────

/** "2026-10-04" → Date para guardar o comparar en una columna @db.Date. */
export function dayToDb(day: DayKey): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** Date leído de una columna @db.Date → "2026-10-04". */
export function dbToDay(date: Date): DayKey {
  return date.toISOString().slice(0, 10) as DayKey;
}

// ─── Columnas DateTime (instantes) ─────────────────────────────────────────

/** Primer instante (UTC) del día de México. Para filtrar createdAt >= … */
export function startOfDayInTZ(day: DayKey): Date {
  return fromZonedTime(`${day}T00:00:00.000`, APP_TIMEZONE);
}

/** Último instante (UTC) del día de México. Para filtrar createdAt <= … */
export function endOfDayInTZ(day: DayKey): Date {
  return fromZonedTime(`${day}T23:59:59.999`, APP_TIMEZONE);
}

// ─── Rangos para filtros ───────────────────────────────────────────────────

export type RangePreset = "today" | "week" | "month";

/** Rango inclusivo de días calendario. */
export type DayRange = { from: DayKey; to: DayKey };

/**
 * Rango de un filtro rápido, en días de México. La semana empieza en lunes.
 * Para columnas @db.Date: `{ gte: dayToDb(from), lte: dayToDb(to) }`.
 */
export function getRange(preset: RangePreset, now: Date = new Date()): DayRange {
  const today = getToday(now);
  if (preset === "today") return { from: today, to: today };

  if (preset === "week") {
    const weekday = dayToDb(today).getUTCDay(); // 0 = domingo
    const monday = addDays(today, weekday === 0 ? -6 : 1 - weekday);
    return { from: monday, to: addDays(monday, 6) };
  }
  const [year, month] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)); // día 0 del mes siguiente
  return { from: `${today.slice(0, 8)}01` as DayKey, to: dbToDay(lastDay) };
}

/** Filtro de Prisma para una columna @db.Date dentro de un rango. */
export function dayRangeWhere(range: DayRange) {
  return { gte: dayToDb(range.from), lte: dayToDb(range.to) };
}

// ─── Mostrar ───────────────────────────────────────────────────────────────

/** Día calendario para mostrar: "sáb 4 oct 2026". */
export function formatDay(day: DayKey | Date, pattern = "EEE d MMM yyyy"): string {
  const key = typeof day === "string" ? day : dbToDay(day);
  // Se formatea en UTC porque el Date de un DayKey es medianoche UTC.
  return formatInTimeZone(dayToDb(key), "UTC", pattern, { locale: es });
}

/** Instante para mostrar en hora de México: "4 oct 2026, 23:15". */
export function formatForDisplay(instant: Date, pattern = "d MMM yyyy, HH:mm"): string {
  return formatInTimeZone(instant, APP_TIMEZONE, pattern, { locale: es });
}
