import "server-only";
import { db } from "@/lib/db";
import { dbToDay, formatForDisplay, type DayKey } from "@/lib/date";
import { parseCode } from "@/lib/codes";
import { toNameKey } from "@/lib/normalize";
import { getSettings } from "@/lib/settings";
import type { Prisma, Priority } from "@/generated/prisma/client";
import { BUCKETS, placementWhere, type Bucket, type Placement } from "./buckets";
import { readyWhatsAppUrl } from "./whatsapp";

// Todo lo que sale de aquí es serializable (días como "yyyy-MM-dd", instantes
// ya formateados en hora de México) para pasarlo a Client Components.

/** `code` es el folio: se muestra con formatCode("client", code) → CLI-0001. */
export type ClientOption = { id: string; code: number; name: string; phone: string | null };

export type ReminderItem = {
  id: string;
  targetDate: DayKey;
  targetTime: string | null;
  note: string;
  priority: Priority;
  isCompleted: boolean;
  /** "4 oct, 10:15" en hora de México. */
  completedAtLabel: string | null;
  completedByName: string | null;
  createdById: string;
  createdByName: string;
  createdAt: Date;
  /** "4 oct, 10:15" en hora de México. */
  createdAtLabel: string;
  /** WhatsApp con el aviso de «ya está listo» (null si el cliente no tiene teléfono). */
  readyUrl: string | null;
  client: ClientOption;
};

const CLIENT_FIELDS = { id: true, code: true, name: true, phone: true } as const;

const ORDER: Record<Placement, Prisma.OrderReminderOrderByWithRelationInput[]> = {
  // Del día: primero los urgentes, luego por hora límite (sin hora, al final).
  hoy: [{ priority: "desc" }, { targetTime: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  manana: [{ priority: "desc" }, { targetTime: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  // Atrasados: el más viejo arriba.
  atrasados: [{ targetDate: "asc" }, { priority: "desc" }, { targetTime: { sort: "asc", nulls: "last" } }],
  despues: [{ targetDate: "asc" }, { priority: "desc" }, { targetTime: { sort: "asc", nulls: "last" } }],
  completados: [{ completedAt: "desc" }],
};

/** Días que muestra «Atrasados» (Configuración). `allOverdue` lo ignora. */
async function overdueDays(allOverdue = false): Promise<number | null> {
  if (allOverdue) return null;
  const { overdueLookbackDays } = await getSettings();
  return overdueLookbackDays > 0 ? overdueLookbackDays : null;
}

const REMINDER_INCLUDE = {
  client: { select: CLIENT_FIELDS },
  completedBy: { select: { name: true } },
  createdBy: { select: { name: true } },
} as const;

type ReminderRowDb = Prisma.OrderReminderGetPayload<{ include: typeof REMINDER_INCLUDE }>;

async function toItems(rows: ReminderRowDb[]): Promise<ReminderItem[]> {
  const settings = await getSettings();
  return rows.map((r) => ({
    id: r.id,
    targetDate: dbToDay(r.targetDate),
    targetTime: r.targetTime,
    note: r.note,
    priority: r.priority,
    isCompleted: r.isCompleted,
    completedAtLabel: r.completedAt ? formatForDisplay(r.completedAt, "d MMM, HH:mm") : null,
    completedByName: r.completedBy?.name ?? null,
    createdById: r.createdById,
    createdByName: r.createdBy.name,
    createdAt: r.createdAt,
    createdAtLabel: formatForDisplay(r.createdAt, "d MMM, HH:mm"),
    readyUrl: readyWhatsAppUrl(settings.readyMessage, r.client, settings.businessName),
    client: r.client,
  }));
}

export async function getReminders(placement: Placement, now: Date = new Date(), { allOverdue = false } = {}): Promise<ReminderItem[]> {
  const days = await overdueDays(allOverdue);
  const rows = await db.orderReminder.findMany({
    where: placementWhere(placement, now, days),
    orderBy: ORDER[placement],
    take: placement === "completados" ? 100 : undefined,
    include: REMINDER_INCLUDE,
  });
  return toItems(rows);
}

function searchWhere(q: string): Prisma.OrderReminderWhereInput {
  const digits = q.replace(/\D/g, "");
  const code = parseCode(q, "client");
  return {
    deletedAt: null,
    OR: [
      { note: { contains: q, mode: "insensitive" } },
      { client: { nameKey: { contains: toNameKey(q) } } },
      ...(code !== null ? [{ client: { code } }] : []),
      ...(digits.length >= 3 ? [{ client: { phone: { contains: digits } } }] : []),
    ],
  };
}

/**
 * Buscador: por cliente (nombre, folio CLI-0005 / cli5 / 5, teléfono) o por el
 * texto del pedido, en todas las pestañas. Pendientes primero (por fecha),
 * luego completados (lo más reciente primero).
 */
export async function searchReminders(query: string): Promise<ReminderItem[]> {
  const q = query.trim();
  if (!q) return [];
  const rows = await db.orderReminder.findMany({
    where: searchWhere(q),
    orderBy: [{ isCompleted: "asc" }, { targetDate: "asc" }, { targetTime: { sort: "asc", nulls: "last" } }],
    take: 60,
    include: REMINDER_INCLUDE,
  });
  // Completados: lo más reciente primero.
  const pending = rows.filter((r) => !r.isCompleted);
  const done = rows.filter((r) => r.isCompleted).sort((a, b) => b.targetDate.getTime() - a.targetDate.getTime());
  return toItems([...pending, ...done]);
}

export type ReminderExportRow = {
  clientCode: number;
  clientName: string;
  clientPhone: string | null;
  targetDate: DayKey;
  targetTime: string | null;
  priority: Priority;
  note: string;
  isCompleted: boolean;
  /** "04/10/2026 13:03" en hora de México. */
  completedAt: string | null;
  completedByName: string | null;
  createdByName: string;
  createdAt: string;
};

/**
 * Lo que se ve en /recordatorios con esos filtros, sin el tope de la pantalla:
 * la búsqueda, o la pestaña (Mañana incluye «Más adelante»).
 */
export async function getRemindersForExport(
  { bucket, q, allOverdue }: { bucket: Bucket; q: string; allOverdue: boolean },
  now: Date = new Date(),
): Promise<ReminderExportRow[]> {
  let rows: ReminderRowDb[];
  if (q) {
    rows = await db.orderReminder.findMany({ where: searchWhere(q), orderBy: [{ isCompleted: "asc" }, { targetDate: "asc" }], include: REMINDER_INCLUDE });
  } else {
    const days = await overdueDays(allOverdue);
    const places: Placement[] = bucket === "manana" ? ["manana", "despues"] : [bucket];
    const lists = await Promise.all(
      places.map((place) => db.orderReminder.findMany({ where: placementWhere(place, now, days), orderBy: ORDER[place], include: REMINDER_INCLUDE })),
    );
    rows = lists.flat();
  }
  const stamp = "dd/MM/yyyy HH:mm";
  return rows.map((r) => ({
    clientCode: r.client.code,
    clientName: r.client.name,
    clientPhone: r.client.phone,
    targetDate: dbToDay(r.targetDate),
    targetTime: r.targetTime,
    priority: r.priority,
    note: r.note,
    isCompleted: r.isCompleted,
    completedAt: r.completedAt ? formatForDisplay(r.completedAt, stamp) : null,
    completedByName: r.completedBy?.name ?? null,
    createdByName: r.createdBy.name,
    createdAt: formatForDisplay(r.createdAt, stamp),
  }));
}

/** Contador de cada pestaña, más los atrasados que quedan fuera del límite de días. */
export async function getReminderCounts(
  now: Date = new Date(),
  { allOverdue = false } = {},
): Promise<Record<Bucket, number> & { antiguos: number }> {
  const days = await overdueDays(allOverdue);
  const places = [...BUCKETS, "antiguos"] as const;
  const counts = await Promise.all(places.map((place) => db.orderReminder.count({ where: placementWhere(place, now, days) })));
  return Object.fromEntries(places.map((place, i) => [place, place === "antiguos" && !days ? 0 : counts[i]])) as Record<Bucket, number> & {
    antiguos: number;
  };
}

/** Globo de la navegación: pendientes de hoy y atrasados. */
export async function getReminderBadge(now: Date = new Date()) {
  // El globo cuenta todos los atrasados, aunque Atrasados muestre solo los últimos N días.
  const [today, overdue] = await Promise.all([
    db.orderReminder.count({ where: placementWhere("hoy", now) }),
    db.orderReminder.count({ where: placementWhere("atrasados", now) }),
  ]);
  return { count: today + overdue, overdue: overdue > 0 };
}

/**
 * Busca clientes por nombre, folio (CLI-0003, cli3 o 3) o teléfono. Sin texto, los más recientes.
 * Excluye los fusionados (deletedAt).
 */
export async function findClients(query: string, take = 8): Promise<ClientOption[]> {
  const q = query.trim();
  const where: Prisma.ClientWhereInput = { deletedAt: null };
  if (q) {
    const digits = q.replace(/\D/g, "");
    const code = parseCode(q, "client");
    where.OR = [
      { nameKey: { contains: toNameKey(q) } },
      ...(code !== null ? [{ code }] : []),
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
    ];
  }
  return db.client.findMany({
    where,
    orderBy: q ? { nameKey: "asc" } : { updatedAt: "desc" },
    take,
    select: CLIENT_FIELDS,
  });
}
