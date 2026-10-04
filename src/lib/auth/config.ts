import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";

const DAY = 60 * 60 * 24;
const LAN_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),

  // Solo desarrollo: acepta el login desde el celular en la red local
  // (http://192.168.x.x:3000). En producción solo vale BETTER_AUTH_URL.
  trustedOrigins: async (request) => {
    if (process.env.NODE_ENV !== "development" || !request) return [];
    const origin = request.headers.get("origin");
    return origin && LAN_ORIGIN.test(origin) ? [origin] : [];
  },

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
