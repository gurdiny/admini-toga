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

export async function getReminders(placement: Placement, now: Date = new Date()): Promise<ReminderItem[]> {
  const [rows, settings] = await Promise.all([
    db.orderReminder.findMany({
      where: placementWhere(placement, now),
      orderBy: ORDER[placement],
      take: placement === "completados" ? 100 : undefined,
      include: {
        client: { select: CLIENT_FIELDS },
        completedBy: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    getSettings(),
  ]);
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
