import "server-only";
import { db } from "@/lib/db";
import { dbToDay, dayRangeWhere, formatDay, formatForDisplay, type DayKey, type DayRange } from "@/lib/date";
import { moneyToString, toMXN, ZERO, type Decimal } from "@/lib/money";
import { toNameKey } from "@/lib/normalize";
import { summarizePayments, supplierBalances, totalBalances, type Balances, type BreakdownRow } from "./aggregate";
import { parseCode } from "@/lib/codes";
import { getSettings } from "@/lib/settings";
import type { PaymentMethod, Prisma } from "@/generated/prisma/client";

// Todo lo que sale de aquí es serializable (montos como string "1250.00",
// días como "yyyy-MM-dd") para poder pasarlo a Client Components.

export type { Balances, BreakdownRow } from "./aggregate";

// ─── Saldos ────────────────────────────────────────────────────────────────

/**
 * Saldo pendiente por proveedor y moneda: adeudos vigentes − abonos vigentes.
 * Solo incluye proveedores que deben algo.
 */
export async function getSupplierBalances(supplierIds?: string[]): Promise<Map<string, Balances>> {
  const supplierFilter = supplierIds ? { supplierId: { in: supplierIds } } : {};
  const [debts, paid] = await Promise.all([
    db.supplierDebt.groupBy({
      by: ["supplierId", "currency"],
      where: { deletedAt: null, ...supplierFilter },
      _sum: { amount: true },
    }),
    db.supplierPayment.groupBy({
      by: ["supplierId", "currency"],
      where: { deletedAt: null, debtId: { not: null }, ...supplierFilter },
      _sum: { amount: true },
    }),
  ]);

  return supplierBalances(
    debts.map((row) => ({ supplierId: row.supplierId, currency: row.currency, amount: row._sum.amount })),
    paid.map((row) => ({ supplierId: row.supplierId, currency: row.currency, amount: row._sum.amount })),
  );
}

export type DebtSummary = {
  id: string;
  code: number;
  kind: "OPENING_BALANCE" | "CREDIT";
  date: DayKey;
  dueDate: DayKey | null;
  description: string;
  supplierRef: string | null;
  notes: string | null;
  currency: string;
  categoryId: string | null;
  categoryName: string | null;
  amount: string;
  paid: string;
  balance: string;
  isSettled: boolean;
  createdById: string;
  createdAt: Date;
};

/** Adeudos de un proveedor con lo abonado y su saldo. */
export async function getSupplierDebts(supplierId: string, { onlyOpen = false } = {}): Promise<DebtSummary[]> {
  const debts = await db.supplierDebt.findMany({
    where: { supplierId, deletedAt: null },
    orderBy: [{ date: "asc" }, { code: "asc" }],
    include: {
      category: { select: { name: true } },
      payments: { where: { deletedAt: null }, select: { amount: true } },
    },
  });

  return debts
    .map((debt) => {
      const paid = debt.payments.reduce<Decimal>((sum, p) => sum.add(p.amount), ZERO);
      const balance = debt.amount.sub(paid);
      return {
        id: debt.id,
        code: debt.code,
        kind: debt.kind,
        date: dbToDay(debt.date),
        dueDate: debt.dueDate ? dbToDay(debt.dueDate) : null,
        description: debt.description,
        supplierRef: debt.supplierRef,
        notes: debt.notes,
        currency: debt.currency,
        categoryId: debt.categoryId,
        categoryName: debt.category?.name ?? null,
        amount: moneyToString(debt.amount),
        paid: moneyToString(paid),
        balance: moneyToString(balance),
        isSettled: balance.lte(0),
        createdById: debt.createdById,
        createdAt: debt.createdAt,
      };
    })
    .filter((debt) => !onlyOpen || !debt.isSettled);
}

// ─── Proveedores ───────────────────────────────────────────────────────────

export type SupplierListItem = {
  id: string;
  code: number;
  name: string;
  contactName: string | null;
  phone: string | null;
  hasWhatsApp: boolean;
  categoryName: string | null;
  isActive: boolean;
  balances: Balances;
};

/** Listado con búsqueda por nombre, contacto, teléfono o código (PROV-0003). */
export async function listSuppliers({
  search = "",
  includeInactive = false,
}: { search?: string; includeInactive?: boolean } = {}): Promise<SupplierListItem[]> {
  const query = search.trim();
  const where: Prisma.SupplierWhereInput = includeInactive ? {} : { isActive: true };
  if (query) {
    const code = parseCode(query, "supplier");
    const digits = query.replace(/\D/g, "");
    where.OR = [
      { nameKey: { contains: toNameKey(query) } },
      { contactName: { contains: query, mode: "insensitive" } },
      ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
      ...(code !== null ? [{ code }] : []),
    ];
  }

  const suppliers = await db.supplier.findMany({
    where,
    orderBy: { nameKey: "asc" },
    include: { category: { select: { name: true } } },
  });
  const balances = await getSupplierBalances(suppliers.map((s) => s.id));

  return suppliers.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    contactName: s.contactName,
    phone: s.phone,
    hasWhatsApp: s.hasWhatsApp,
    categoryName: s.category?.name ?? null,
    isActive: s.isActive,
    balances: balances.get(s.id) ?? {},
  }));
}

export async function getSupplier(id: string) {
  return db.supplier.findUnique({
    where: { id },
    include: { category: { select: { id: true, name: true } } },
  });
}

// ─── Estado de cuenta ──────────────────────────────────────────────────────

export type StatementEntry = {
  type: "DEBT" | "ABONO" | "CONTADO";
  id: string;
  code: number;
  date: DayKey;
  description: string;
  currency: string;
  /** Positivo: aumenta lo que se debe. Negativo: abono. CONTADO no afecta el saldo. */
  amount: string;
  /** Saldo después de este movimiento, en su moneda. */
  balanceAfter: string;
  debtCode: number | null;
  paymentMethod: PaymentMethod | null;
  createdById: string;
  createdAt: Date;
  /** Solo en pagos: quién y cuándo (Ver detalle). */
  trace: PaymentTrace | null;
  categoryName: string | null;
  /** Datos para editar, solo en pagos. */
  payment: {
    id: string;
    date: DayKey;
    supplierId: string;
    categoryId: string;
    concept: string;
    amount: string;
    currency: string;
    exchangeRate: string | null;
    paymentMethod: PaymentMethod;
    debtId: string | null;
    order: PaymentOrderRef | null;
  } | null;
};

/** Movimientos del proveedor en orden cronológico con saldo corrido. */
export async function getSupplierStatement(supplierId: string): Promise<StatementEntry[]> {
  const [debts, payments] = await Promise.all([
    db.supplierDebt.findMany({ where: { supplierId, deletedAt: null } }),
    db.supplierPayment.findMany({
      where: { supplierId, deletedAt: null },
      include: { debt: { select: { code: true } }, createdBy: { select: { name: true } }, category: { select: { name: true } }, order: ORDER_SELECT },
    }),
  ]);
  const traces = await paymentTraces(payments);

  type Raw = Omit<StatementEntry, "balanceAfter"> & { sortDate: number; sortCreated: number; delta: Decimal };
  const raw: Raw[] = [
    ...debts.map((d) => ({
      type: "DEBT" as const,
      id: d.id,
      code: d.code,
      date: dbToDay(d.date),
      description: d.kind === "OPENING_BALANCE" ? `Saldo inicial · ${d.description}` : d.description,
      currency: d.currency,
      amount: moneyToString(d.amount),
      debtCode: d.code,
      paymentMethod: null,
      createdById: d.createdById,
      createdAt: d.createdAt,
      trace: null,
      categoryName: null,
      payment: null,
      sortDate: d.date.getTime(),
      sortCreated: d.createdAt.getTime(),
      delta: d.amount,
    })),
    ...payments.map((p) => ({
      type: p.debtId ? ("ABONO" as const) : ("CONTADO" as const),
      id: p.id,
      code: p.code,
      date: dbToDay(p.date),
      description: p.concept,
      currency: p.currency,
      amount: moneyToString(p.debtId ? p.amount.neg() : p.amount),
      debtCode: p.debt?.code ?? null,
      paymentMethod: p.paymentMethod,
      createdById: p.createdById,
      createdAt: p.createdAt,
      trace: traces.get(p.id)!,
      categoryName: p.category.name,
      payment: {
        id: p.id,
        date: dbToDay(p.date),
        supplierId: p.supplierId,
        categoryId: p.categoryId,
        concept: p.concept,
        amount: moneyToString(p.amount),
        currency: p.currency,
        exchangeRate: p.exchangeRate?.toString() ?? null,
        paymentMethod: p.paymentMethod,
        debtId: p.debtId,
        order: toOrderRef(p.order),
      },
      sortDate: p.date.getTime(),
      sortCreated: p.createdAt.getTime(),
      delta: p.debtId ? p.amount.neg() : ZERO,
    })),
  ];

  // Mismo día: primero el adeudo, luego sus abonos; después, por captura.
  raw.sort(
    (a, b) =>
      a.sortDate - b.sortDate ||
      Number(b.type === "DEBT") - Number(a.type === "DEBT") ||
      a.sortCreated - b.sortCreated,
  );

  const running = new Map<string, Decimal>();
  return raw.map(({ sortDate: _d, sortCreated: _c, delta, ...entry }) => {
    running.set(entry.currency, (running.get(entry.currency) ?? ZERO).add(delta));
    return { ...entry, balanceAfter: moneyToString(running.get(entry.currency) ?? ZERO) };
  });
}

// ─── Pedido de cliente ligado a un pago ───────────────────────────────────

/** Pedido (recordatorio) al que corresponde un pago: «Ana López · 12 oct». */
export type PaymentOrderRef = { id: string; clientId: string; label: string };

const ORDER_SELECT = { select: { id: true, targetDate: true, client: { select: { id: true, name: true } } } } as const;

function toOrderRef(order: { id: string; targetDate: Date; client: { id: string; name: string } } | null): PaymentOrderRef | null {
  return order ? { id: order.id, clientId: order.client.id, label: `${order.client.name} · ${formatDay(dbToDay(order.targetDate), "d MMM yyyy")}` } : null;
}

// ─── Traza: quién y cuándo ─────────────────────────────────────────────────

/** Para «Ver detalle»: hora exacta de captura y última edición (de la auditoría). */
export type PaymentTrace = {
  /** "domingo 4 de octubre de 2026, 13:03:27" en hora de México. */
  createdAt: string;
  createdBy: string;
  editedAt: string | null;
  editedBy: string | null;
  edits: number;
};

const TRACE_FORMAT = "EEEE d 'de' MMMM 'de' yyyy, HH:mm:ss";

async function paymentTraces(payments: { id: string; createdAt: Date; createdBy: { name: string } }[]): Promise<Map<string, PaymentTrace>> {
  const edits = payments.length
    ? await db.auditLog.findMany({
        where: { entity: "SupplierPayment", action: "UPDATE", entityId: { in: payments.map((p) => p.id) } },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true } } },
      })
    : [];
  const byPayment = new Map<string, typeof edits>();
  for (const log of edits) byPayment.set(log.entityId, [...(byPayment.get(log.entityId) ?? []), log]);
  return new Map(
    payments.map((p) => {
      const logs = byPayment.get(p.id) ?? [];
      return [
        p.id,
        {
          createdAt: formatForDisplay(p.createdAt, TRACE_FORMAT),
          createdBy: p.createdBy.name,
          editedAt: logs[0] ? formatForDisplay(logs[0].createdAt, TRACE_FORMAT) : null,
          editedBy: logs[0]?.user.name ?? null,
          edits: logs.length,
        },
      ];
    }),
  );
}

// ─── Pagos ─────────────────────────────────────────────────────────────────

export const PAYMENT_SORTS = ["date", "amount", "supplier"] as const;
export type PaymentSort = (typeof PAYMENT_SORTS)[number];
export const PAGE_SIZE = 50;

export type PaymentFilters = {
  range: DayRange;
  supplierId?: string;
  categoryId?: string;
  search?: string;
  sort?: PaymentSort;
  dir?: "asc" | "desc";
  page?: number;
};

export type PaymentListItem = {
  id: string;
  code: number;
  date: DayKey;
  concept: string;
  amount: string;
  currency: string;
  exchangeRate: string | null;
  paymentMethod: PaymentMethod;
  supplierId: string;
  supplierName: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  debtId: string | null;
  debtCode: number | null;
  order: PaymentOrderRef | null;
  createdById: string;
  createdByName: string;
  createdAt: Date;
  trace: PaymentTrace;
};

function paymentWhere(filters: PaymentFilters): Prisma.SupplierPaymentWhereInput {
  const where: Prisma.SupplierPaymentWhereInput = {
    deletedAt: null,
    date: dayRangeWhere(filters.range),
  };
  if (filters.supplierId) where.supplierId = filters.supplierId;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  const query = filters.search?.trim();
  if (query) {
    const code = parseCode(query, "payment");
    where.OR = [
      { concept: { contains: query, mode: "insensitive" } },
      { supplier: { nameKey: { contains: toNameKey(query) } } },
      ...(code !== null ? [{ code }] : []),
    ];
  }
  return where;
}

function paymentOrder(filters: PaymentFilters): Prisma.SupplierPaymentOrderByWithRelationInput[] {
  const dir = filters.dir ?? "desc";
  return filters.sort === "amount"
    ? [{ amount: dir }, { code: "desc" }]
    : filters.sort === "supplier"
      ? [{ supplier: { nameKey: dir } }, { date: "desc" }, { code: "desc" }]
      : [{ date: dir }, { code: dir }];
}

export async function getPayments(filters: PaymentFilters): Promise<{ items: PaymentListItem[]; total: number }> {
  const where = paymentWhere(filters);
  const orderBy = paymentOrder(filters);
  const page = Math.max(1, filters.page ?? 1);

  const [rows, total] = await Promise.all([
    db.supplierPayment.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        supplier: { select: { name: true } },
        category: { select: { name: true, color: true } },
        debt: { select: { code: true } },
        createdBy: { select: { name: true } },
        order: ORDER_SELECT,
      },
    }),
    db.supplierPayment.count({ where }),
  ]);
  const traces = await paymentTraces(rows);

  return {
    total,
    items: rows.map((p) => ({
      id: p.id,
      code: p.code,
      date: dbToDay(p.date),
      concept: p.concept,
      amount: moneyToString(p.amount),
      currency: p.currency,
      exchangeRate: p.exchangeRate?.toString() ?? null,
      paymentMethod: p.paymentMethod,
      supplierId: p.supplierId,
      supplierName: p.supplier.name,
      categoryId: p.categoryId,
      categoryName: p.category.name,
      categoryColor: p.category.color,
      debtId: p.debtId,
      debtCode: p.debt?.code ?? null,
      order: toOrderRef(p.order),
      createdById: p.createdById,
      createdByName: p.createdBy.name,
      createdAt: p.createdAt,
      trace: traces.get(p.id)!,
    })),
  };
}

/** Tope de filas al exportar: un año de pagos de la joyería cabe de sobra. */
export const EXPORT_LIMIT = 20_000;

export type PaymentExportRow = {
  code: number;
  date: DayKey;
  supplierCode: number;
  supplierName: string;
  concept: string;
  categoryName: string;
  paymentMethod: PaymentMethod;
  debtCode: number | null;
  currency: string;
  amount: string;
  exchangeRate: string | null;
  /** En pesos: amount × tipo de cambio (igual que los totales de la pantalla). */
  amountMXN: string;
  clientName: string | null;
  clientCode: number | null;
  createdByName: string;
  /** "04/10/2026 13:03" en hora de México. */
  createdAt: string;
};

/** Todos los pagos de los filtros de /pagos (sin paginar), en el mismo orden. */
export async function getPaymentsForExport(filters: Omit<PaymentFilters, "page">): Promise<PaymentExportRow[]> {
  const rows = await db.supplierPayment.findMany({
    where: paymentWhere(filters),
    orderBy: paymentOrder(filters),
    take: EXPORT_LIMIT,
    include: {
      supplier: { select: { code: true, name: true } },
      category: { select: { name: true } },
      debt: { select: { code: true } },
      createdBy: { select: { name: true } },
      order: { select: { client: { select: { code: true, name: true } } } },
    },
  });
  return rows.map((p) => ({
    code: p.code,
    date: dbToDay(p.date),
    supplierCode: p.supplier.code,
    supplierName: p.supplier.name,
    concept: p.concept,
    categoryName: p.category.name,
    paymentMethod: p.paymentMethod,
    debtCode: p.debt?.code ?? null,
    currency: p.currency,
    amount: moneyToString(p.amount),
    exchangeRate: p.exchangeRate?.toString() ?? null,
    amountMXN: moneyToString(toMXN(p)),
    clientName: p.order?.client.name ?? null,
    clientCode: p.order?.client.code ?? null,
    createdByName: p.createdBy.name,
    createdAt: formatForDisplay(p.createdAt, "dd/MM/yyyy HH:mm"),
  }));
}

export type PaymentsSummary = {
  /** Total pagado en el rango, en pesos (otras monedas × tipo de cambio). */
  totalPaid: string;
  count: number;
  topSupplier: { name: string; total: string } | null;
  bySupplier: BreakdownRow[];
  byCategory: BreakdownRow[];
  /** Saldo pendiente con todos los proveedores, hoy (no depende del rango). */
  totalOwed: Balances;
};

/** Solo para quien puede ver totales (canViewTotals). */
export async function getPaymentsSummary(range: DayRange): Promise<PaymentsSummary> {
  const [payments, balances] = await Promise.all([
    db.supplierPayment.findMany({
      where: { deletedAt: null, date: dayRangeWhere(range) },
      select: {
        amount: true,
        currency: true,
        exchangeRate: true,
        supplier: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } },
      },
    }),
    getSupplierBalances(),
  ]);

  return { ...summarizePayments(payments), totalOwed: totalBalances(balances.values()) };
}

// ─── Opciones para formularios ─────────────────────────────────────────────

export async function getCaptureOptions() {
  const [suppliers, paymentCategories, supplierCategories, settings] = await Promise.all([
    db.supplier.findMany({
      where: { isActive: true },
      orderBy: { nameKey: "asc" },
      select: { id: true, code: true, name: true },
    }),
    db.category.findMany({
      where: { type: "PAYMENT", isActive: true },
      orderBy: [{ sortOrder: "asc" }, { nameKey: "asc" }],
      select: { id: true, name: true, color: true },
    }),
    db.category.findMany({
      where: { type: "SUPPLIER", isActive: true },
      orderBy: [{ sortOrder: "asc" }, { nameKey: "asc" }],
      select: { id: true, name: true, color: true },
    }),
    getSettings(),
  ]);
  // Valores por defecto de /admin/configuracion para los formularios de captura.
  const defaults = { currency: settings.defaultCurrency, paymentMethod: settings.defaultPaymentMethod };
  return { suppliers, paymentCategories, supplierCategories, defaults };
}

export type CaptureOptions = Awaited<ReturnType<typeof getCaptureOptions>>;
