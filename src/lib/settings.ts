import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import type { PaymentMethod } from "@/generated/prisma/client";

/** Configuración editable desde /admin/configuracion (Fase 6), con valores por defecto. */
export type AppSettings = {
  businessName: string;
  defaultCurrency: string;
  defaultPaymentMethod: PaymentMethod;
  overdueLookbackDays: number;
};

const DEFAULTS: AppSettings = {
  businessName: "TOGA Plata .925",
  defaultCurrency: "MXN",
  defaultPaymentMethod: "EFECTIVO",
  overdueLookbackDays: 30,
};

export const getSettings = cache(async (): Promise<AppSettings> => {
  const rows = await db.appSetting.findMany();
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return { ...DEFAULTS, ...(stored as Partial<AppSettings>) };
});
