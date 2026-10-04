import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import type { PaymentMethod } from "@/generated/prisma/client";
import { DEFAULT_READY_MESSAGE } from "@/modules/reminders/whatsapp";

/** Configuración editable desde /admin/configuracion (Fase 6), con valores por defecto. */
export type AppSettings = {
  businessName: string;
  defaultCurrency: string;
  defaultPaymentMethod: PaymentMethod;
  overdueLookbackDays: number;
  /** Aviso de pedido listo por WhatsApp. Variables: {cliente}, {negocio}, {folio}. */
  readyMessage: string;
};

const DEFAULTS: AppSettings = {
  businessName: "TOGA Plata .925",
  defaultCurrency: "MXN",
  defaultPaymentMethod: "EFECTIVO",
  overdueLookbackDays: 30,
  readyMessage: DEFAULT_READY_MESSAGE,
};

export const getSettings = cache(async (): Promise<AppSettings> => {
  const rows = await db.appSetting.findMany();
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return { ...DEFAULTS, ...(stored as Partial<AppSettings>) };
});
