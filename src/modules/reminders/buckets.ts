// Clasificación de recordatorios en pestañas. Todo se decide con el día de
// México (src/lib/date.ts), nunca con la fecha de la máquina ni del celular.
// Sin dependencias de servidor: sirve igual para las consultas y las pruebas.

import { addDays, dayToDb, getToday, getTomorrow, startOfDayInTZ, type DayKey } from "@/lib/date";

/** Pestañas en el orden en que se muestran. «Mañana» va primero y es la de por defecto. */
export const BUCKETS = ["manana", "hoy", "atrasados", "completados"] as const;
export type Bucket = (typeof BUCKETS)[number];
export const DEFAULT_BUCKET: Bucket = "manana";

export const BUCKET_LABELS: Record<Bucket, string> = {
  manana: "Mañana",
  hoy: "Hoy",
  atrasados: "Atrasados",
  completados: "Completados",
};

/** Cuántos días hacia atrás se muestran en «Completados». */
export const COMPLETED_WINDOW_DAYS = 30;

/**
 * A dónde va un recordatorio. «despues» (pasado mañana en adelante) no es
 * pestaña: se muestra como «Más adelante» debajo de «Mañana».
 */
export type Placement = Bucket | "despues";

export function classifyReminder(
  reminder: { targetDate: DayKey; isCompleted: boolean },
  now: Date = new Date(),
): Placement {
  if (reminder.isCompleted) return "completados";
  const today = getToday(now);
  if (reminder.targetDate < today) return "atrasados";
  if (reminder.targetDate === today) return "hoy";
  if (reminder.targetDate === getTomorrow(now)) return "manana";
  return "despues";
}

/** `?vista=` de la URL → pestaña. Cualquier otra cosa → «Mañana». */
export function parseBucket(value: string | string[] | undefined): Bucket {
  const raw = Array.isArray(value) ? value[0] : value;
  return (BUCKETS as readonly string[]).includes(raw ?? "") ? (raw as Bucket) : DEFAULT_BUCKET;
}

export function bucketHref(bucket: Bucket): string {
  return bucket === DEFAULT_BUCKET ? "/recordatorios" : `/recordatorios?vista=${bucket}`;
}

/**
 * Filtro de Prisma (OrderReminder) para cada lugar. Siempre excluye los
 * borrados. `targetDate` es @db.Date: se compara contra medianoche UTC del
 * día de México (dayToDb).
 */
export function placementWhere(placement: Placement, now: Date = new Date()) {
  const today = getToday(now);
  const pending = { deletedAt: null, isCompleted: false } as const;
  switch (placement) {
    case "manana":
      return { ...pending, targetDate: dayToDb(getTomorrow(now)) };
    case "hoy":
      return { ...pending, targetDate: dayToDb(today) };
    case "atrasados":
      return { ...pending, targetDate: { lt: dayToDb(today) } };
    case "despues":
      return { ...pending, targetDate: { gt: dayToDb(getTomorrow(now)) } };
    case "completados":
      return {
        deletedAt: null,
        isCompleted: true,
        completedAt: { gte: startOfDayInTZ(addDays(today, -COMPLETED_WINDOW_DAYS)) },
      };
  }
}
