import "server-only";
import { db } from "@/lib/db";
import { dbToDay, dayRangeWhere, type DayKey, type DayRange } from "@/lib/date";
import { moneyToString, toDecimal, ZERO, type Decimal } from "@/lib/money";
import { toNameKey } from "@/lib/normalize";
import { parseCode } from "@/lib/codes";
import type { PaymentMethod, Prisma } from "@/generated/prisma/client";

// Todo lo que sale de aquí es serializable (montos como string "1250.00",
// días como "yyyy-MM-dd") para poder pasarlo a Client Components.

/** Saldos por moneda: { MXN: "14299.50" }. Normalmente solo MXN. */
export type Balances = Record<string, string>;

function addTo(map: Map<string, Decimal>, key: string, amount: Decimal) {
  map.set(key, (map.get(key) ?? ZERO).add(amount));
}

function toBalances(map: Map<string, Decimal>): Balances {
  const out: Balances = {};
  for (const [currency, amount] of map) if (!amount.isZero()) out[currency] = moneyToString(amount);
  return out;
}

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

  const bySupplier = new Map<string, Map<string, Decimal>>();
  const bucket = (id: string) => bySupplier.get(id) ?? bySupplier.set(id, new Map()).get(id)!;
  for (const row of debts) addTo(bucket(row.supplierId), row.currency, row._sum.amount ?? ZERO);
  for (const row of paid) addTo(bucket(row.supplierId), row.currency, (row._sum.amount ?? ZERO).neg());

  const result = new Map<string, Balances>();
  for (const [id, map] of bySupplier) {
    const balances = toBalances(map);
    if (Object.keys(balances).length) result.set(id, balances);
  }
  return result;
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
  } | null;
};

/** Movimientos del proveedor en orden cronológico con saldo corrido. */
export async function getSupplierStatement(supplierId: string): Promise<StatementEntry[]> {
  const [debts, payments] = await Promise.all([
    db.supplierDebt.findMany({ where: { supplierId, deletedAt: null } }),
    db.supplierPayment.findMany({
      where: { supplierId, deletedAt: null },
      include: { debt: { select: { code: true } } },
    }),
  ]);

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
    addTo(running, entry.currency, delta);
    return { ...entry, balanceAfter: moneyToString(running.get(entry.currency) ?? ZERO) };
  });
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
  createdById: string;
  createdByName: string;
  createdAt: Date;
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

export async function getPayments(filters: PaymentFilters): Promise<{ items: PaymentListItem[]; total: number }> {
  const where = paymentWhere(filters);
  const dir = filters.dir ?? "desc";
  const orderBy: Prisma.SupplierPaymentOrderByWithRelationInput[] =
    filters.sort === "amount"
      ? [{ amount: dir }, { code: "desc" }]
      : filters.sort === "supplier"
        ? [{ supplier: { nameKey: dir } }, { date: "desc" }, { code: "desc" }]
        : [{ date: dir }, { code: dir }];
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
      },
    }),
    db.supplierPayment.count({ where }),
  ]);

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
      createdById: p.createdById,
      createdByName: p.createdBy.name,
      createdAt: p.createdAt,
    })),
  };
}

export type BreakdownRow = { id: string; name: string; color?: string; total: string; count: number };

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

  let total = ZERO;
  const bySupplier = new Map<string, BreakdownRow & { sum: Decimal }>();
  const byCategory = new Map<string, BreakdownRow & { sum: Decimal }>();
  for (const p of payments) {
    const mxn = p.currency === "MXN" ? p.amount : p.amount.mul(p.exchangeRate ?? toDecimal(1));
    total = total.add(mxn);
    for (const [map, item] of [
      [bySupplier, p.supplier],
      [byCategory, p.category],
    ] as const) {
      const row = map.get(item.id) ?? { ...item, total: "0", count: 0, sum: ZERO };
      row.sum = row.sum.add(mxn);
      row.count += 1;
      map.set(item.id, row);
    }
  }

  const finish = (map: Map<string, BreakdownRow & { sum: Decimal }>) =>
    [...map.values()]
      .sort((a, b) => b.sum.comparedTo(a.sum))
      .map(({ sum, ...row }) => ({ ...row, total: moneyToString(sum) }));

  const owed = new Map<string, Decimal>();
  for (const supplierBalances of balances.values()) {
    for (const [currency, amount] of Object.entries(supplierBalances)) addTo(owed, currency, toDecimal(amount));
  }

  const suppliers = finish(bySupplier);
  return {
    totalPaid: moneyToString(total),
    count: payments.length,
    topSupplier: suppliers[0] ? { name: suppliers[0].name, total: suppliers[0].total } : null,
    bySupplier: suppliers,
    byCategory: finish(byCategory),
    totalOwed: toBalances(owed),
  };
}

// ─── Opciones para formularios ─────────────────────────────────────────────

export async function getCaptureOptions() {
  const [suppliers, paymentCategories, supplierCategories] = await Promise.all([
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
  ]);
  return { suppliers, paymentCategories, supplierCategories };
}

export type CaptureOptions = Awaited<ReturnType<typeof getCaptureOptions>>;
