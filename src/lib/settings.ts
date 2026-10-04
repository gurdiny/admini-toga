import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
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
  /** Módulos visibles. Apagado = se oculta de la navegación y sus páginas mandan al inicio. */
  modules: Record<ModuleKey, boolean>;
};

export const MODULE_KEYS = ["payments", "reminders"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

const DEFAULTS: AppSettings = {
  businessName: "TOGA Plata .925",
  defaultCurrency: "MXN",
  defaultPaymentMethod: "EFECTIVO",
  overdueLookbackDays: 30,
  readyMessage: DEFAULT_READY_MESSAGE,
  modules: { payments: true, reminders: true },
};

export const getSettings = cache(async (): Promise<AppSettings> => {
  const rows = await db.appSetting.findMany();
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const settings = { ...DEFAULTS, ...(stored as Partial<AppSettings>) };
  // Un módulo nuevo que aún no está guardado cuenta como encendido.
  return { ...settings, modules: { ...DEFAULTS.modules, ...settings.modules } };
});

/** Para páginas de un módulo: si está apagado en Configuración, manda al inicio. */
export async function requireModule(key: ModuleKey): Promise<void> {
  const { modules } = await getSettings();
  if (!modules[key]) redirect("/");
}
