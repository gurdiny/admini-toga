import { z } from "zod";
import { CategoryType, Role } from "@/generated/prisma/browser";
import { zId, zText } from "@/lib/validation";

export const categorySchema = z.object({
  name: zText("El nombre de la categoría", 60),
  type: z.enum(CategoryType),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color no válido, usa formato #90ac53.")
    .default("#737373"),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

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
