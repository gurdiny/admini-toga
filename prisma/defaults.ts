// Catálogos y configuración con los que arranca una base nueva. Los usan el
// seed de desarrollo (prisma/seed.ts) y la instalación en producción
// (prisma/setup.ts). Después se administran desde /admin: nada de esto se
// vuelve a imponer sobre lo que el dueño haya cambiado.
import type { Prisma } from "../src/generated/prisma/client";
import { DEFAULT_READY_MESSAGE } from "../src/modules/reminders/whatsapp";

/** TOGA solo vende plata .925. De pago: qué se compró o qué trabajo se pagó. */
export const PAYMENT_CATEGORIES = [
  ["Anillos", "#c23d73"],
  ["Aretes", "#d67da1"],
  ["Pulseras", "#6671ba"],
  ["Cadenas", "#6a5acd"],
  ["Collares", "#4f6b24"],
  ["Dijes", "#90ac53"],
  ["Mano de obra", "#aa3a3e"],
  ["Otros", "#737373"],
] as const;

/** De proveedor: si entrega piezas terminadas o hace mano de obra. */
export const SUPPLIER_CATEGORIES = [
  ["Joyería", "#c23d73"],
  ["Mano de obra", "#aa3a3e"],
] as const;

export const DEFAULT_SETTINGS: Record<string, Prisma.InputJsonValue> = {
  businessName: "TOGA Plata .925",
  defaultCurrency: "MXN",
  defaultPaymentMethod: "EFECTIVO", // casi todos los pagos son en efectivo
  overdueLookbackDays: 30,
  readyMessage: DEFAULT_READY_MESSAGE, // aviso por WhatsApp de pedido listo
  modules: { payments: true, reminders: true },
};
