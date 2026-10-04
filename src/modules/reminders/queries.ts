import "server-only";
import { db } from "@/lib/db";
import { dbToDay, formatForDisplay, type DayKey } from "@/lib/date";
import { toNameKey } from "@/lib/normalize";
import type { Prisma, Priority } from "@/generated/prisma/client";
import { BUCKETS, placementWhere, type Bucket, type Placement } from "./buckets";

// Todo lo que sale de aquí es serializable (días como "yyyy-MM-dd", instantes
// ya formateados en hora de México) para pasarlo a Client Components.

export type ClientOption = { id: string; name: string; phone: string | null; folio: string | null };

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
  createdAt: Date;
  client: ClientOption;
};

const ORDER: Record<Placement, Prisma.OrderReminderOrderByWithRelationInput[]> = {
  // Del día: primero los urgentes, luego por hora límite (sin hora, al final).
  hoy: [{ priority: "desc" }, { targetTime: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  manana: [{ priority: "desc" }, { targetTime: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  // Atrasados: el más viejo arriba.
  atrasados: [{ targetDate: "asc" }, { priority: "desc" }, { targetTime: { sort: "asc", nulls: "last" } }],
  despues: [{ targetDate: "asc" }, { priority: "desc" }, { targetTime: { sort: "asc", nulls: "last" } }],
  completados: [{ completedAt: "desc" }],
};

export async function getReminders(placement: Placement, now: Date = new Date()): Promise<ReminderItem[]> {
  const rows = await db.orderReminder.findMany({
    where: placementWhere(placement, now),
    orderBy: ORDER[placement],
    take: placement === "completados" ? 100 : undefined,
    include: {
      client: { select: { id: true, name: true, phone: true, folio: true } },
      completedBy: { select: { name: true } },
    },
  });
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
    createdAt: r.createdAt,
    client: r.client,
  }));
}

/** Contador de cada pestaña. */
export async function getReminderCounts(now: Date = new Date()): Promise<Record<Bucket, number>> {
  const counts = await Promise.all(BUCKETS.map((bucket) => db.orderReminder.count({ where: placementWhere(bucket, now) })));
  return Object.fromEntries(BUCKETS.map((bucket, i) => [bucket, counts[i]])) as Record<Bucket, number>;
}

/** Globo de la navegación: pendientes de hoy y atrasados. */
export async function getReminderBadge(now: Date = new Date()) {
  const [today, overdue] = await Promise.all([
    db.orderReminder.count({ where: placementWhere("hoy", now) }),
    db.orderReminder.count({ where: placementWhere("atrasados", now) }),
  ]);
  return { count: today + overdue, overdue: overdue > 0 };
}

/**
 * Busca clientes por nombre, folio o teléfono. Sin texto, los más recientes.
 * Excluye los fusionados (deletedAt).
 */
export async function findClients(query: string, take = 8): Promise<ClientOption[]> {
  const q = query.trim();
  const where: Prisma.ClientWhereInput = { deletedAt: null };
  if (q) {
    const digits = q.replace(/\D/g, "");
    where.OR = [
      { nameKey: { contains: toNameKey(q) } },
      { folio: { contains: q.replace(/\s+/g, "").toUpperCase() } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
    ];
  }
  return db.client.findMany({
    where,
    orderBy: q ? { nameKey: "asc" } : { updatedAt: "desc" },
    take,
    select: { id: true, name: true, phone: true, folio: true },
  });
}
