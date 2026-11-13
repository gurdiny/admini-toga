import "server-only";
import { db } from "@/lib/db";
import { dbToDay, dayRangeWhere, formatDay, formatForDisplay, type DayKey, type DayRange } from "@/lib/date";
import { moneyToString, toMXN, ZERO, type Decimal } from "@/lib/money";
import { toNameKey } from "@/lib/normalize";
import {
  isSplitSettled,
  subtractSplit,
  sumSplits,
  summarizePayments,
  supplierBalances,
  toSplit,
  totalBalances,
  type Balances,
  type BreakdownRow,
  type Split,
} from "./aggregate";
import { formatCode, parseCode } from "@/lib/codes";
import { mergeSorted, type MergeSort } from "./merge";
import { getSettings } from "@/lib/settings";
import type { PaymentMethod, Prisma } from "@/generated/prisma/client";

// Todo lo que sale de aquí es serializable (montos como string "1250.00",
// días como "yyyy-MM-dd") para poder pasarlo a Client Components.

export type { Balances, BreakdownRow, Split } from "./aggregate";

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

/** Un abono dentro de la nota: el historial que se ve en cada mitad. */
export type DebtPaymentRow = {
  id: string;
  code: number;
  date: DayKey;
  concept: string;
  amount: string;
  amountMetal: string;
  amountLabor: string;
};

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
  /** Total de la nota (metal + hechura). */
  amount: string;
  /** Los dos renglones de la nota, lo abonado en cada uno y lo que falta. */
  amounts: Split;
  paid: Split;
  balance: Split;
  isSettled: boolean;
  /** Abonos vigentes, del más nuevo al más viejo. */
  payments: DebtPaymentRow[];
  createdById: string;
  createdAt: Date;
};

/** Notas de un proveedor con lo abonado y el saldo de cada renglón. */
export async function getSupplierDebts(supplierId: string, { onlyOpen = false } = {}): Promise<DebtSummary[]> {
  const debts = await db.supplierDebt.findMany({
    where: { supplierId, deletedAt: null },
    orderBy: [{ date: "asc" }, { code: "asc" }],
    include: {
      category: { select: { name: true } },
      payments: {
        where: { deletedAt: null },
        orderBy: [{ date: "desc" }, { code: "desc" }],
        select: { id: true, code: true, date: true, concept: true, amount: true, amountMetal: true, amountLabor: true },
      },
    },
  });

  return debts
    .map((debt) => {
      const amounts = toSplit(debt.amountMetal, debt.amountLabor);
      const paid = sumSplits(debt.payments);
      const balance = subtractSplit(amounts, paid);
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
        amounts,
        paid,
        balance,
        isSettled: isSplitSettled(balance),
        payments: debt.payments.map((payment) => ({
          id: payment.id,
          code: payment.code,
          date: dbToDay(payment.date),
          concept: payment.concept,
          amount: moneyToString(payment.amount),
          amountMetal: moneyToString(payment.amountMetal),
          amountLabor: moneyToString(payment.amountLabor),
        })),
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
  chargesMetal: boolean;
  chargesLabor: boolean;
  isActive: boolean;
  balances: Balances;
};

/** Listado con búsqueda por nombre, contacto, teléfono o código (PROV-0003). */
export async function listSuppliers({
  search = "",
  includeInactive = false,
}: { search?: string; includeInactive?: boolean } = {}): Promise<SupplierListItem[]> {
  const query = search.trim();
  // Los borrados nunca salen en listados ni en los buscadores.
  const where: Prisma.SupplierWhereInput = includeInactive
    ? { deletedAt: null }
    : { isActive: true, deletedAt: null };
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
  });
  const balances = await getSupplierBalances(suppliers.map((s) => s.id));

  return suppliers.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    contactName: s.contactName,
    phone: s.phone,
    hasWhatsApp: s.hasWhatsApp,
    chargesMetal: s.chargesMetal,
    chargesLabor: s.chargesLabor,
    isActive: s.isActive,
    balances: balances.get(s.id) ?? {},
  }));
}

export async function getSupplier(id: string) {
  return db.supplier.findFirst({ where: { id, deletedAt: null } });
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
  /** Cuánto del movimiento fue metal y cuánto hechura (siempre en positivo). */
  split: Split;
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
    amountMetal: string;
    amountLabor: string;
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
      split: toSplit(d.amountMetal, d.amountLabor),
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
      split: toSplit(p.amountMetal, p.amountLabor),
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
        amountMetal: moneyToString(p.amountMetal),
        amountLabor: moneyToString(p.amountLabor),
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

const ORDER_SELECT = {
  select: { id: true, targetDate: true, deletedAt: true, client: { select: { id: true, name: true, deletedAt: true } } },
} as const;

/**
 * Pedido de cliente al que corresponde el pago. Si el pedido o su cliente se
 * borraron, el pago se queda pero deja de enseñar el enlace: llevaría a una
 * ficha que ya no existe.
 */
function toOrderRef(
  order: { id: string; targetDate: Date; deletedAt: Date | null; client: { id: string; name: string; deletedAt: Date | null } } | null,
): PaymentOrderRef | null {
  if (!order || order.deletedAt || order.client.deletedAt) return null;
  return { id: order.id, clientId: order.client.id, label: `${order.client.name} · ${formatDay(dbToDay(order.targetDate), "d MMM yyyy")}` };
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

async function paymentTraces(
  payments: { id: string; createdAt: Date; createdBy: { name: string } }[],
  entity: "SupplierPayment" | "OtherPayment" = "SupplierPayment",
): Promise<Map<string, PaymentTrace>> {
  const edits = payments.length
    ? await db.auditLog.findMany({
        where: { entity, action: "UPDATE", entityId: { in: payments.map((p) => p.id) } },
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
  /** Total pagado y cómo se repartió entre los dos renglones. */
  amount: string;
  amountMetal: string;
  amountLabor: string;
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
  const page = Math.max(1, filters.page ?? 1);
  const [items, total] = await Promise.all([
    fetchPaymentItems(where, paymentOrder(filters), (page - 1) * PAGE_SIZE, PAGE_SIZE),
    db.supplierPayment.count({ where }),
  ]);
  return { items, total };
}

async function fetchPaymentItems(
  where: Prisma.SupplierPaymentWhereInput,
  orderBy: Prisma.SupplierPaymentOrderByWithRelationInput[],
  skip: number,
  take: number,
): Promise<PaymentListItem[]> {
  const rows = await db.supplierPayment.findMany({
    where,
    orderBy,
    skip,
    take,
    include: {
      supplier: { select: { name: true } },
      category: { select: { name: true, color: true } },
      debt: { select: { code: true } },
      createdBy: { select: { name: true } },
      order: ORDER_SELECT,
    },
  });
  const traces = await paymentTraces(rows);

  return rows.map((p) => ({
    id: p.id,
    code: p.code,
    date: dbToDay(p.date),
    concept: p.concept,
    amount: moneyToString(p.amount),
    amountMetal: moneyToString(p.amountMetal),
    amountLabor: moneyToString(p.amountLabor),
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
  }));
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
  amountMetal: string;
  amountLabor: string;
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
      order: { select: { deletedAt: true, client: { select: { code: true, name: true, deletedAt: true } } } },
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
    amountMetal: moneyToString(p.amountMetal),
    amountLabor: moneyToString(p.amountLabor),
    amount: moneyToString(p.amount),
    exchangeRate: p.exchangeRate?.toString() ?? null,
    amountMXN: moneyToString(toMXN(p)),
    // Un pedido o un cliente borrado no se exporta (igual que en la pantalla).
    clientName: p.order && !p.order.deletedAt && !p.order.client.deletedAt ? p.order.client.name : null,
    clientCode: p.order && !p.order.deletedAt && !p.order.client.deletedAt ? p.order.client.code : null,
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

// ─── Pagos sin proveedor ───────────────────────────────────────────────────

export type OtherPaymentListItem = {
  id: string;
  code: number;
  date: DayKey;
  /** "HH:mm" hora de México. */
  time: string;
  amount: string;
  currency: string;
  note: string;
  createdById: string;
  createdByName: string;
  createdAt: Date;
  trace: PaymentTrace;
};

/** Sin proveedor no hay orden por proveedor: cae en fecha. */
type OtherPaymentFilters = Pick<PaymentFilters, "range" | "search" | "sort" | "dir" | "page">;

function otherPaymentWhere(filters: OtherPaymentFilters): Prisma.OtherPaymentWhereInput {
  const where: Prisma.OtherPaymentWhereInput = { deletedAt: null, date: dayRangeWhere(filters.range) };
  const query = filters.search?.trim();
  if (query) {
    const code = parseCode(query, "otherPayment");
    where.OR = [{ note: { contains: query, mode: "insensitive" } }, ...(code !== null ? [{ code }] : [])];
  }
  return where;
}

function otherPaymentOrder(sort: MergeSort, dir: "asc" | "desc"): Prisma.OtherPaymentOrderByWithRelationInput[] {
  return sort === "amount"
    ? [{ amount: dir }, { date: "desc" }, { time: "desc" }, { code: "desc" }]
    : [{ date: dir }, { time: dir }, { code: dir }];
}

const mergeSort = (sort: PaymentSort | undefined): MergeSort => (sort === "amount" ? "amount" : "date");

async function fetchOtherPaymentItems(
  where: Prisma.OtherPaymentWhereInput,
  orderBy: Prisma.OtherPaymentOrderByWithRelationInput[],
  skip: number,
  take: number,
): Promise<OtherPaymentListItem[]> {
  const rows = await db.otherPayment.findMany({ where, orderBy, skip, take, include: { createdBy: { select: { name: true } } } });
  const traces = await paymentTraces(rows, "OtherPayment");
  return rows.map((p) => ({
    id: p.id,
    code: p.code,
    date: dbToDay(p.date),
    time: p.time,
    amount: moneyToString(p.amount),
    currency: p.currency,
    note: p.note,
    createdById: p.createdById,
    createdByName: p.createdBy.name,
    createdAt: p.createdAt,
    trace: traces.get(p.id)!,
  }));
}

export async function getOtherPayments(filters: OtherPaymentFilters): Promise<{ items: OtherPaymentListItem[]; total: number }> {
  const where = otherPaymentWhere(filters);
  const page = Math.max(1, filters.page ?? 1);
  const [items, total] = await Promise.all([
    fetchOtherPaymentItems(where, otherPaymentOrder(mergeSort(filters.sort), filters.dir ?? "desc"), (page - 1) * PAGE_SIZE, PAGE_SIZE),
    db.otherPayment.count({ where }),
  ]);
  return { items, total };
}

export type OtherPaymentsSummary = { totalPaid: string; count: number };

/** Solo para quien puede ver totales (canViewTotals). Siempre en pesos. */
export async function getOtherPaymentsSummary(range: DayRange): Promise<OtherPaymentsSummary> {
  const result = await db.otherPayment.aggregate({
    where: { deletedAt: null, date: dayRangeWhere(range) },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return { totalPaid: moneyToString(result._sum.amount ?? ZERO), count: result._count._all };
}

export type OtherPaymentExportRow = {
  code: number;
  date: DayKey;
  time: string;
  note: string;
  currency: string;
  amount: string;
  createdByName: string;
  createdAt: string;
};

export async function getOtherPaymentsForExport(filters: Omit<OtherPaymentFilters, "page">): Promise<OtherPaymentExportRow[]> {
  const rows = await db.otherPayment.findMany({
    where: otherPaymentWhere(filters),
    orderBy: otherPaymentOrder(mergeSort(filters.sort), filters.dir ?? "desc"),
    take: EXPORT_LIMIT,
    include: { createdBy: { select: { name: true } } },
  });
  return rows.map((p) => ({
    code: p.code,
    date: dbToDay(p.date),
    time: p.time,
    note: p.note,
    currency: p.currency,
    amount: moneyToString(p.amount),
    createdByName: p.createdBy.name,
    createdAt: formatForDisplay(p.createdAt, "dd/MM/yyyy HH:mm"),
  }));
}

// ─── Todos los pagos (con y sin proveedor) ─────────────────────────────────

export type PaymentEntry =
  | { kind: "supplier"; payment: PaymentListItem }
  | { kind: "other"; payment: OtherPaymentListItem };

/**
 * Los dos tipos de pago en una sola lista. Cada tabla se pide ya ordenada y
 * se intercalan en `mergeSorted`; para la página N basta con las primeras
 * N × PAGE_SIZE filas de cada una. El mismo día, por hora (la del pago sin
 * proveedor y la de captura del pago a proveedor).
 */
export async function getAllPayments(filters: OtherPaymentFilters): Promise<{ items: PaymentEntry[]; total: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const sort = mergeSort(filters.sort);
  const dir = filters.dir ?? "desc";
  const supplierWhere = paymentWhere({ range: filters.range, search: filters.search });
  const otherWhere = otherPaymentWhere(filters);
  const supplierOrder: Prisma.SupplierPaymentOrderByWithRelationInput[] =
    sort === "amount" ? [{ amount: dir }, { date: "desc" }, { createdAt: "desc" }] : [{ date: dir }, { createdAt: dir }];

  const [suppliers, others, supplierTotal, otherTotal] = await Promise.all([
    fetchPaymentItems(supplierWhere, supplierOrder, 0, page * PAGE_SIZE),
    fetchOtherPaymentItems(otherWhere, otherPaymentOrder(sort, dir), 0, page * PAGE_SIZE),
    db.supplierPayment.count({ where: supplierWhere }),
    db.otherPayment.count({ where: otherWhere }),
  ]);

  const merged = mergeSorted(
    suppliers,
    others,
    {
      first: (p) => ({ date: p.date, time: formatForDisplay(p.createdAt, "HH:mm:ss"), amount: p.amount }),
      second: (p) => ({ date: p.date, time: p.time, amount: p.amount }),
    },
    sort,
    dir,
    (page - 1) * PAGE_SIZE,
    PAGE_SIZE,
  );
  return {
    total: supplierTotal + otherTotal,
    items: merged.map((entry) =>
      entry.from === "first" ? { kind: "supplier" as const, payment: entry.item } : { kind: "other" as const, payment: entry.item },
    ),
  };
}

export type AllPaymentsExportRow = {
  folio: string;
  date: DayKey;
  time: string | null;
  supplierName: string | null;
  concept: string;
  categoryName: string | null;
  paymentMethod: PaymentMethod | null;
  type: string;
  currency: string;
  amount: string;
  amountMXN: string;
  createdByName: string;
  createdAt: string;
};

/** Los dos tipos de pago en un solo archivo, en el mismo orden que la pantalla. */
export async function getAllPaymentsForExport(filters: Omit<OtherPaymentFilters, "page">): Promise<AllPaymentsExportRow[]> {
  const sort = mergeSort(filters.sort);
  const dir = filters.dir ?? "desc";
  const [suppliers, others] = await Promise.all([
    getPaymentsForExport({ range: filters.range, search: filters.search, sort, dir }),
    getOtherPaymentsForExport({ range: filters.range, search: filters.search, sort, dir }),
  ]);
  return mergeSorted(
    suppliers,
    others,
    {
      // "dd/MM/yyyy HH:mm": la hora de captura desempata el mismo día.
      first: (p) => ({ date: p.date, time: p.createdAt.slice(-5), amount: p.amount }),
      second: (p) => ({ date: p.date, time: p.time, amount: p.amount }),
    },
    sort,
    dir,
    0,
    EXPORT_LIMIT,
  ).map((entry) =>
    entry.from === "first"
      ? {
          folio: formatCode("payment", entry.item.code),
          date: entry.item.date,
          time: null,
          supplierName: entry.item.supplierName,
          concept: entry.item.concept,
          categoryName: entry.item.categoryName,
          paymentMethod: entry.item.paymentMethod,
          type: entry.item.debtCode ? `Abono a ${formatCode("debt", entry.item.debtCode)}` : "Contado",
          currency: entry.item.currency,
          amount: entry.item.amount,
          amountMXN: entry.item.amountMXN,
          createdByName: entry.item.createdByName,
          createdAt: entry.item.createdAt,
        }
      : {
          folio: formatCode("otherPayment", entry.item.code),
          date: entry.item.date,
          time: entry.item.time,
          supplierName: null,
          concept: entry.item.note,
          categoryName: null,
          paymentMethod: null,
          type: "Sin proveedor",
          currency: entry.item.currency,
          amount: entry.item.amount,
          amountMXN: entry.item.amount,
          createdByName: entry.item.createdByName,
          createdAt: entry.item.createdAt,
        },
  );
}

// ─── Opciones para formularios ─────────────────────────────────────────────

export async function getCaptureOptions() {
  const [suppliers, paymentCategories, settings] = await Promise.all([
    db.supplier.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { nameKey: "asc" },
      select: { id: true, code: true, name: true },
    }),
    db.category.findMany({
      where: { type: "PAYMENT", isActive: true },
      orderBy: [{ sortOrder: "asc" }, { nameKey: "asc" }],
      select: { id: true, name: true, color: true },
    }),
    getSettings(),
  ]);
  // Valores por defecto de /admin/configuracion para los formularios de captura.
  const defaults = { currency: settings.defaultCurrency, paymentMethod: settings.defaultPaymentMethod };
  return { suppliers, paymentCategories, defaults };
}

export type CaptureOptions = Awaited<ReturnType<typeof getCaptureOptions>>;
