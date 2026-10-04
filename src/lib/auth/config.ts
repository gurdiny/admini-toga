import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";

const DAY = 60 * 60 * 24;

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    // Nadie se registra solo: los usuarios los crea un OWNER desde /admin/usuarios.
    disableSignUp: true,
    minPasswordLength: 8,
  },

  // 30 días para no pedir contraseña cada mañana en el mostrador; se renueva
  // con el uso. Sin cookieCache a propósito: cada request lee la sesión de la
  // base, así desactivar un usuario o cambiarle el rol aplica de inmediato.
  session: {
    expiresIn: 30 * DAY,
    updateAge: DAY,
  },

  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "STAFF", input: false },
      isActive: { type: "boolean", required: false, defaultValue: true, input: false },
    },
  },

  databaseHooks: {
    session: {
      create: {
        // Un usuario desactivado no puede iniciar sesión aunque su contraseña sea correcta.
        before: async (session) => {
          const user = await db.user.findUnique({
            where: { id: session.userId },
            select: { isActive: true },
          });
          if (!user?.isActive) {
            throw new APIError("FORBIDDEN", { message: "USUARIO_INACTIVO" });
          }
        },
      },
    },
  },

  // Debe ir al final: permite que auth.api.* fije cookies desde Server Actions.
  plugins: [nextCookies()],
});
