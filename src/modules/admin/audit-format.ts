// Convierte un registro de AuditLog en líneas legibles en español.
// Sin dependencias de servidor: se prueba con Vitest.

import { formatDay, formatForDisplay, isDayKey } from "@/lib/date";
import { formatMoney } from "@/lib/money";

export const ENTITY_LABELS: Record<string, string> = {
  SupplierPayment: "Pago",
  SupplierDebt: "Adeudo",
  Supplier: "Proveedor",
  OrderReminder: "Recordatorio",
  Client: "Cliente",
  Category: "Categoría",
  User: "Usuario",
  AppSetting: "Configuración",
};

/** Nombre de cada ajuste de /admin/configuracion (AppSetting.key). */
export const SETTING_LABELS: Record<string, string> = {
  businessName: "Nombre del negocio",
  defaultCurrency: "Moneda por defecto",
  defaultPaymentMethod: "Método de pago por defecto",
  overdueLookbackDays: "Días que se muestran en Atrasados",
  readyMessage: "Mensaje de pedido listo",
  modules: "Módulos visibles",
};

const MODULE_LABELS: Record<string, string> = { payments: "Pagos", reminders: "Recordatorios" };

export const ACTION_LABELS: Record<string, string> = {
  CREATE: "Creó",
  UPDATE: "Cambió",
  DELETE: "Mandó a la papelera",
  RESTORE: "Restauró",
};

const FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  amount: "Monto",
  currency: "Moneda",
  exchangeRate: "Tipo de cambio",
  date: "Fecha",
  dueDate: "Fecha límite",
  concept: "Concepto",
  description: "Descripción",
  paymentMethod: "Método de pago",
  categoryId: "Categoría",
  supplierId: "Proveedor",
  clientId: "Cliente",
  debtId: "Adeudo",
  orderId: "Pedido",
  kind: "Tipo",
  supplierRef: "Folio del proveedor",
  notes: "Notas",
  note: "Nota",
  phone: "Teléfono",
  hasWhatsApp: "Tiene WhatsApp",
  email: "Correo",
  address: "Dirección",
  contactName: "Contacto",
  targetDate: "Para el día",
  targetTime: "Hora límite",
  priority: "Prioridad",
  isCompleted: "Completado",
  completedAt: "Completado el",
  completedById: "Completado por",
  isActive: "Activo",
  role: "Rol",
  color: "Color",
  sortOrder: "Orden",
  type: "Tipo",
  deletedAt: "En papelera desde",
  password: "Contraseña",
  value: "Valor",
  key: "Ajuste",
  code: "Código",
};

/** Campos internos que no le dicen nada al dueño. */
const HIDDEN = new Set(["id", "nameKey", "createdById", "createdAt", "updatedAt", "emailVerified", "image", "movedOrders"]);
const DAY_FIELDS = new Set(["date", "dueDate", "targetDate"]);
const INSTANT_FIELDS = new Set(["completedAt", "deletedAt"]);
const MONEY_FIELDS = new Set(["amount"]);

const VALUE_LABELS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta",
  CHEQUE: "Cheque",
  OPENING_BALANCE: "Saldo inicial",
  CREDIT: "Crédito",
  NORMAL: "Normal",
  ALTA: "Alta",
  OWNER: "Dueño",
  STAFF: "Mostrador",
  PAYMENT: "De pago",
  SUPPLIER: "De proveedor",
};

/** Nombre o código de un id relacionado (categoría, proveedor, cliente…). */
export type Lookup = Record<string, string>;

export function formatValue(field: string, value: unknown, lookup: Lookup = {}, currency = "MXN"): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "string") {
    if (field.endsWith("Id")) return lookup[value] ?? "(otro registro)";
    if (DAY_FIELDS.has(field) && isDayKey(value.slice(0, 10))) return formatDay(value.slice(0, 10) as `${number}-${number}-${number}`, "d MMM yyyy");
    if (INSTANT_FIELDS.has(field) && !Number.isNaN(Date.parse(value))) return formatForDisplay(new Date(value), "d MMM yyyy, HH:mm");
    if (MONEY_FIELDS.has(field)) return formatMoney(value, currency);
    return VALUE_LABELS[value] ?? value;
  }
  if (typeof value === "number") return String(value);
  // Módulos: { payments: true, reminders: false } → "Pagos: Sí · Recordatorios: No"
  if (typeof value === "object" && Object.values(value as object).every((v) => typeof v === "boolean")) {
    return Object.entries(value as Record<string, boolean>)
      .map(([k, v]) => `${MODULE_LABELS[k] ?? k}: ${v ? "Sí" : "No"}`)
      .join(" · ");
  }
  return JSON.stringify(value);
}

export type ChangeLine = { field: string; label: string; from?: string; to: string };

type Changes = Record<string, unknown>;

/**
 * Líneas del cambio:
 * - CREATE: los datos con que se creó.
 * - UPDATE / RESTORE: solo lo que cambió (de → a).
 * - DELETE: nada que listar (el título ya lo dice).
 */
export function describeChanges(action: string, changes: unknown, lookup: Lookup = {}): ChangeLine[] {
  if (!changes || typeof changes !== "object") return [];
  const data = changes as Changes;

  if (action === "DELETE") return [];

  if (action === "CREATE" && data.after && typeof data.after === "object") {
    const after = data.after as Changes;
    const currency = typeof after.currency === "string" ? after.currency : "MXN";
    return Object.entries(after)
      .filter(([field, value]) => !HIDDEN.has(field) && value !== null && value !== "" && value !== false)
      .map(([field, value]) => ({ field, label: FIELD_LABELS[field] ?? field, to: formatValue(field, value, lookup, currency) }));
  }

  return Object.entries(data)
    .filter(([field, value]) => !HIDDEN.has(field) && value && typeof value === "object" && "to" in (value as object))
    .map(([field, value]) => {
      const { from, to } = value as { from: unknown; to: unknown };
      return {
        field,
        label: FIELD_LABELS[field] ?? field,
        from: formatValue(field, from, lookup),
        to: formatValue(field, to, lookup),
      };
    });
}

/** Ids de otros registros que aparecen en los cambios, para resolver su nombre. */
export function referencedIds(changes: unknown): string[] {
  const ids = new Set<string>();
  const visit = (value: unknown, key = "") => {
    if (typeof value === "string" && key.endsWith("Id")) ids.add(value);
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) visit(v, k === "from" || k === "to" ? key : k);
    }
  };
  visit(changes);
  return [...ids];
}
