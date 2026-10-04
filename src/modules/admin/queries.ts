import "server-only";
import { formatCode, parseCode } from "@/lib/codes";
import { db } from "@/lib/db";
import { dbToDay, endOfDayInTZ, formatDay, formatForDisplay, startOfDayInTZ, type DayKey } from "@/lib/date";
import { formatMoney, moneyToString, toDecimal, ZERO, type Decimal } from "@/lib/money";
import { toNameKey } from "@/lib/normalize";
import type { CategoryType, Prisma } from "@/generated/prisma/client";
import { describeChanges, referencedIds, SETTING_LABELS, type ChangeLine, type Lookup } from "./audit-format";

// Consultas de /admin. Todo serializable (sin Decimal ni funciones).

export type CategoryRow = {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  /** Pagos + adeudos (de pago) o proveedores (de proveedor) que la usan, incluidos borrados. */
  usage: number;
};

export async function listCategories(type: CategoryType): Promise<CategoryRow[]> {
  const rows = await db.category.findMany({
    where: { type },
    orderBy: [{ sortOrder: "asc" }, { nameKey: "asc" }],
    include: { _count: { select: { payments: true, debts: true, suppliers: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
    usage: type === "PAYMENT" ? c._count.payments + c._count.debts : c._count.suppliers,
  }));
}

// ─── Clientes ──────────────────────────────────────────────────────────────

export type ClientRow = {
  id: string;
  code: number;
  name: string;
  phone: string | null;
  orders: number;
  pending: number;
  lastOrder: DayKey | null;
  /** Pagos a proveedores ligados a sus pedidos (SupplierPayment.orderId). */
  totalPaid: string;
};

/** Suma de pagos vigentes ligados a pedidos de cada cliente. */
async function paidByClient(clientIds: string[]): Promise<Map<string, Decimal>> {
  const payments = await db.supplierPayment.findMany({
    where: { deletedAt: null, order: { clientId: { in: clientIds }, deletedAt: null } },
    select: { amount: true, currency: true, exchangeRate: true, order: { select: { clientId: true } } },
  });
  const totals = new Map<string, Decimal>();
  for (const p of payments) {
    const mxn = p.currency === "MXN" ? p.amount : p.amount.mul(p.exchangeRate ?? toDecimal(1));
    const id = p.order!.clientId;
    totals.set(id, (totals.get(id) ?? ZERO).add(mxn));
  }
  return totals;
}

export async function listClients(query = ""): Promise<ClientRow[]> {
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
  const clients = await db.client.findMany({
    where,
    orderBy: { nameKey: "asc" },
    take: 200,
    include: { reminders: { where: { deletedAt: null }, select: { isCompleted: true, targetDate: true } } },
  });
  const paid = await paidByClient(clients.map((c) => c.id));
  return clients.map((c) => {
    const last = c.reminders.reduce<Date | null>((max, r) => (!max || r.targetDate > max ? r.targetDate : max), null);
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      phone: c.phone,
      orders: c.reminders.length,
      pending: c.reminders.filter((r) => !r.isCompleted).length,
      lastOrder: last ? dbToDay(last) : null,
      totalPaid: moneyToString(paid.get(c.id) ?? ZERO),
    };
  });
}

export type ClientDetail = {
  id: string;
  code: number;
  name: string;
  phone: string | null;
  notes: string | null;
  createdAt: string;
  totalPaid: string;
  orders: {
    id: string;
    targetDate: DayKey;
    targetTime: string | null;
    note: string;
    priority: "NORMAL" | "ALTA";
    isCompleted: boolean;
    completedAt: string | null;
    createdByName: string;
  }[];
};

export async function getClientDetail(id: string): Promise<ClientDetail | null> {
  const client = await db.client.findFirst({
    where: { id, deletedAt: null },
    include: {
      reminders: {
        where: { deletedAt: null },
        orderBy: [{ targetDate: "desc" }, { createdAt: "desc" }],
        include: { createdBy: { select: { name: true } } },
      },
    },
  });
  if (!client) return null;
  const paid = await paidByClient([client.id]);
  return {
    id: client.id,
    code: client.code,
    name: client.name,
    phone: client.phone,
    notes: client.notes,
    createdAt: formatForDisplay(client.createdAt, "d MMM yyyy"),
    totalPaid: moneyToString(paid.get(client.id) ?? ZERO),
    orders: client.reminders.map((r) => ({
      id: r.id,
      targetDate: dbToDay(r.targetDate),
      targetTime: r.targetTime,
      note: r.note,
      priority: r.priority,
      isCompleted: r.isCompleted,
      completedAt: r.completedAt ? formatForDisplay(r.completedAt, "d MMM yyyy") : null,
      createdByName: r.createdBy.name,
    })),
  };
}

// ─── Usuarios ──────────────────────────────────────────────────────────────

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "STAFF";
  isActive: boolean;
  /** Última actividad de una sesión abierta ("4 oct, 10:15"), o null si no tiene ninguna. */
  lastSeen: string | null;
};

export async function listUsers(): Promise<UserRow[]> {
  const users = await db.user.findMany({
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
    include: { sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } } },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    lastSeen: u.sessions[0] ? formatForDisplay(u.sessions[0].updatedAt, "d MMM, HH:mm") : null,
  }));
}

// ─── Auditoría ─────────────────────────────────────────────────────────────

export const AUDIT_PAGE_SIZE = 50;

export type AuditFilters = { userId?: string; entity?: string; range?: { from: DayKey; to: DayKey }; page: number };

export type AuditRow = {
  id: string;
  when: string;
  userName: string;
  action: string;
  entity: string;
  /** "PAG-0003", "Lucía (CLI-0006)", "Anillos"… */
  record: string;
  lines: ChangeLine[];
};

/** Nombre visible de cada id: pagos, adeudos, proveedores, clientes, categorías, usuarios, pedidos. */
async function labelsFor(ids: string[]): Promise<Lookup> {
  if (!ids.length) return {};
  const where = { id: { in: ids } };
  const [payments, debts, suppliers, clients, categories, users, orders, settings] = await Promise.all([
    db.supplierPayment.findMany({ where, select: { id: true, code: true } }),
    db.supplierDebt.findMany({ where, select: { id: true, code: true } }),
    db.supplier.findMany({ where, select: { id: true, name: true } }),
    db.client.findMany({ where, select: { id: true, name: true, code: true } }),
    db.category.findMany({ where, select: { id: true, name: true } }),
    db.user.findMany({ where, select: { id: true, name: true } }),
    db.orderReminder.findMany({ where, select: { id: true, targetDate: true, client: { select: { name: true } } } }),
    db.appSetting.findMany({ where, select: { id: true, key: true } }),
  ]);
  return Object.fromEntries([
    ...payments.map((p) => [p.id, formatCode("payment", p.code)]),
    ...debts.map((d) => [d.id, formatCode("debt", d.code)]),
    ...suppliers.map((s) => [s.id, s.name]),
    ...clients.map((c) => [c.id, `${c.name} (${formatCode("client", c.code)})`]),
    ...categories.map((c) => [c.id, c.name]),
    ...users.map((u) => [u.id, u.name]),
    ...orders.map((o) => [o.id, `Pedido de ${o.client.name} para el ${formatDay(dbToDay(o.targetDate), "d MMM")}`]),
    ...settings.map((s) => [s.id, SETTING_LABELS[s.key] ?? s.key]),
  ]);
}

export async function getAuditLog(filters: AuditFilters): Promise<{ rows: AuditRow[]; total: number }> {
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.userId && { userId: filters.userId }),
    ...(filters.entity && { entity: filters.entity }),
    ...(filters.range && { createdAt: { gte: startOfDayInTZ(filters.range.from), lte: endOfDayInTZ(filters.range.to) } }),
  };
  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      include: { user: { select: { name: true } } },
    }),
    db.auditLog.count({ where }),
  ]);

  const ids = new Set<string>();
  for (const log of logs) {
    ids.add(log.entityId);
    for (const id of referencedIds(log.changes)) ids.add(id);
  }
  const lookup = await labelsFor([...ids]);

  return {
    total,
    rows: logs.map((log) => ({
      id: log.id,
      when: formatForDisplay(log.createdAt, "d MMM yyyy, HH:mm"),
      userName: log.user.name,
      action: log.action,
      entity: log.entity,
      record: lookup[log.entityId] ?? "(registro)",
      lines: describeChanges(log.action, log.changes, lookup),
    })),
  };
}

export async function auditUsers() {
  return db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
}

// ─── Papelera ──────────────────────────────────────────────────────────────

export const TRASH_TYPES = { pagos: "SupplierPayment", adeudos: "SupplierDebt", recordatorios: "OrderReminder" } as const;
export type TrashType = keyof typeof TRASH_TYPES;

export type TrashRow = {
  type: TrashType;
  id: string;
  /** "PAG-0003 · Taller de Engaste Ruiz" */
  title: string;
  detail: string;
  /** Monto con formato, si aplica. */
  amount: string | null;
  deletedAt: string;
  deletedBy: string | null;
  sortKey: number;
};

export async function listTrash(type?: TrashType): Promise<TrashRow[]> {
  const deleted = { deletedAt: { not: null } } as const;
  const [payments, debts, reminders] = await Promise.all([
    !type || type === "pagos"
      ? db.supplierPayment.findMany({ where: deleted, include: { supplier: { select: { name: true } }, debt: { select: { code: true } } } })
      : [],
    !type || type === "adeudos" ? db.supplierDebt.findMany({ where: deleted, include: { supplier: { select: { name: true } } } }) : [],
    !type || type === "recordatorios" ? db.orderReminder.findMany({ where: deleted, include: { client: { select: { name: true, code: true } } } }) : [],
  ]);

  // Quién lo borró: el último DELETE de la auditoría de cada registro.
  const ids = [...payments, ...debts, ...reminders].map((r) => r.id);
  const logs = ids.length
    ? await db.auditLog.findMany({
        where: { action: "DELETE", entityId: { in: ids } },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true } } },
      })
    : [];
  const deletedBy = new Map<string, string>();
  for (const log of logs) if (!deletedBy.has(log.entityId)) deletedBy.set(log.entityId, log.user.name);

  const when = (d: Date) => formatForDisplay(d, "d MMM yyyy, HH:mm");
  const rows: TrashRow[] = [
    ...payments.map((p) => ({
      type: "pagos" as const,
      id: p.id,
      title: `${formatCode("payment", p.code)} · ${p.supplier.name}`,
      detail: `${p.concept}${p.debt ? ` · abono a ${formatCode("debt", p.debt.code)}` : ""} · ${formatDay(dbToDay(p.date), "d MMM yyyy")}`,
      amount: formatMoney(p.amount, p.currency),
      deletedAt: when(p.deletedAt!),
      deletedBy: deletedBy.get(p.id) ?? null,
      sortKey: p.deletedAt!.getTime(),
    })),
    ...debts.map((d) => ({
      type: "adeudos" as const,
      id: d.id,
      title: `${formatCode("debt", d.code)} · ${d.supplier.name}`,
      detail: `${d.description} · ${formatDay(dbToDay(d.date), "d MMM yyyy")}`,
      amount: formatMoney(d.amount, d.currency),
      deletedAt: when(d.deletedAt!),
      deletedBy: deletedBy.get(d.id) ?? null,
      sortKey: d.deletedAt!.getTime(),
    })),
    ...reminders.map((r) => ({
      type: "recordatorios" as const,
      id: r.id,
      title: `Pedido de ${r.client.name} (${formatCode("client", r.client.code)})`,
      detail: `${r.note} · para el ${formatDay(dbToDay(r.targetDate), "d MMM yyyy")}`,
      amount: null,
      deletedAt: when(r.deletedAt!),
      deletedBy: deletedBy.get(r.id) ?? null,
      sortKey: r.deletedAt!.getTime(),
    })),
  ];
  return rows.sort((a, b) => b.sortKey - a.sortKey);
}
