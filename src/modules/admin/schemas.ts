import { z } from "zod";
import { CategoryType, PaymentMethod, Role } from "@/generated/prisma/browser";
import { CURRENCIES, zId, zText } from "@/lib/validation";
import { clientSchema } from "@/modules/reminders/schemas";

/** Colores para elegir en categorías (paleta de TOGA). */
export const CATEGORY_COLORS = [
  "#c23d73",
  "#d67da1",
  "#6671ba",
  "#6a5acd",
  "#4f6b24",
  "#90ac53",
  "#aa3a3e",
  "#c27c2c",
  "#2f7f8f",
  "#737373",
] as const;

/** El orden se cambia con moveCategory, no desde el formulario. */
export const categorySchema = z.object({
  name: zText("El nombre de la categoría", 60),
  type: z.enum(CategoryType),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color no válido, usa formato #90ac53.")
    .default("#737373"),
});

export const updateCategorySchema = categorySchema.omit({ type: true }).extend({ id: zId("La categoría") });

export const setActiveSchema = z.object({ id: zId(), isActive: z.boolean() });

export const moveCategorySchema = z.object({ id: zId("La categoría"), direction: z.enum(["up", "down"]) });

export const userSchema = z.object({
  name: zText("El nombre", 80),
  email: z.email("Escribe un correo válido.").trim().toLowerCase(),
  role: z.enum(Role).default("STAFF"),
});

export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres.")
  .max(128, "La contraseña es demasiado larga.");

export const createUserSchema = userSchema.extend({ password: passwordSchema });

export const resetPasswordSchema = z.object({ userId: zId("El usuario"), password: passwordSchema });

export type CategoryInput = z.input<typeof categorySchema>;
export type CreateUserInput = z.input<typeof createUserSchema>;

export const updateClientSchema = clientSchema.extend({ id: zId("El cliente") });

export const mergeClientsSchema = z
  .object({ keepId: zId("El cliente que se queda"), mergeId: zId("El cliente duplicado") })
  .refine((data) => data.keepId !== data.mergeId, { path: ["mergeId"], message: "Elige otro cliente: no se puede fusionar consigo mismo." });

export const updateUserSchema = z.object({ id: zId("El usuario"), name: zText("El nombre", 80), role: z.enum(Role) });

/** /admin/configuracion. Las llaves son las de AppSetting (src/lib/settings.ts). */
export const settingsSchema = z.object({
  businessName: zText("El nombre del negocio", 80),
  defaultCurrency: z.enum(CURRENCIES, { error: "Moneda no válida." }),
  defaultPaymentMethod: z.enum(PaymentMethod, { error: "Método no válido." }),
  overdueLookbackDays: z.coerce
    .number({ error: "Escribe un número de días." })
    .int("Escribe un número entero de días.")
    .min(0, "No puede ser negativo.")
    .max(365, "Máximo 365 días."),
  readyMessage: zText("El mensaje", 500),
  modules: z
    .object({ payments: z.boolean(), reminders: z.boolean() })
    .refine((m) => m.payments || m.reminders, "Deja al menos un módulo encendido."),
});

export type SettingsInput = z.input<typeof settingsSchema>;

export const restoreSchema = z.object({
  type: z.enum(["pagos", "adeudos", "recordatorios"]),
  id: zId(),
});
