import "server-only";
import { db } from "@/lib/db";
import { dbToDay, formatForDisplay, type DayKey } from "@/lib/date";
import { moneyToString, toMXN, ZERO, type Decimal } from "@/lib/money";
import type { PaymentMethod, Priority } from "@/generated/prisma/client";

// Historial de un cliente (/clientes/[id]): sus pedidos (recordatorios) y los
// pagos a proveedores ligados a cada pedido (SupplierPayment.orderId).
// Todo serializable: montos string, días DayKey, instantes ya formateados.

export type ClientOrderPayment = {
  id: string;
  code: number;
  date: DayKey;
  supplierId: string;
  supplierName: string;
  concept: string;
  categoryName: string;
  paymentMethod: PaymentMethod;
  amount: string;
  currency: string;
};

export type ClientOrder = {
  id: string;
  targetDate: DayKey;
  targetTime: string | null;
  note: string;
  priority: Priority;
  isCompleted: boolean;
  /** "4 oct 2026" en hora de México. */
  completedAt: string | null;
  createdByName: string;
  payments: ClientOrderPayment[];
  /** Pagos del pedido en pesos (otras monedas × tipo de cambio). */
  paidMXN: string;
};

export type ClientHistory = {
  id: string;
  code: number;
  name: string;
  phone: string | null;
  notes: string | null;
  createdAt: string;
  orders: ClientOrder[];
  /** Todo lo pagado a proveedores por pedidos de este cliente, en pesos. */
  paidMXN: string;
};

export async function getClientHistory(id: string): Promise<ClientHistory | null> {
  const client = await db.client.findFirst({
    where: { id, deletedAt: null },
    include: {
      reminders: {
        where: { deletedAt: null },
        orderBy: [{ targetDate: "desc" }, { createdAt: "desc" }],
        include: {
          createdBy: { select: { name: true } },
          payments: {
            where: { deletedAt: null },
            orderBy: [{ date: "asc" }, { code: "asc" }],
            include: { supplier: { select: { name: true } }, category: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!client) return null;

  let total = ZERO;
  const orders = client.reminders.map((r) => {
    const paid = r.payments.reduce<Decimal>((sum, p) => sum.add(toMXN(p)), ZERO);
    total = total.add(paid);
    return {
      id: r.id,
      targetDate: dbToDay(r.targetDate),
      targetTime: r.targetTime,
      note: r.note,
      priority: r.priority,
      isCompleted: r.isCompleted,
      completedAt: r.completedAt ? formatForDisplay(r.completedAt, "d MMM yyyy") : null,
      createdByName: r.createdBy.name,
      paidMXN: moneyToString(paid),
      payments: r.payments.map((p) => ({
        id: p.id,
        code: p.code,
        date: dbToDay(p.date),
        supplierId: p.supplierId,
        supplierName: p.supplier.name,
        concept: p.concept,
        categoryName: p.category.name,
        paymentMethod: p.paymentMethod,
        amount: moneyToString(p.amount),
        currency: p.currency,
      })),
    };
  });

  return {
    id: client.id,
    code: client.code,
    name: client.name,
    phone: client.phone,
    notes: client.notes,
    createdAt: formatForDisplay(client.createdAt, "d MMM yyyy"),
    orders,
    paidMXN: moneyToString(total),
  };
}
