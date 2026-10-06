"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { clientIp, loginThrottle } from "@/lib/auth/login-throttle";
import { safeNextPath } from "@/lib/safe-redirect";

export type LoginState = { error: string; email: string } | undefined;

const loginSchema = z.object({
  email: z.email("Escribe un correo válido.").trim().toLowerCase(),
  password: z.string().min(1, "Escribe tu contraseña."),
  next: z.string().optional(),
});

function loginErrorMessage(error: APIError): string {
  if (error.message === "USUARIO_INACTIVO") {
    return "Tu usuario está desactivado. Pide al dueño que lo reactive.";
  }
  if (error.status === "TOO_MANY_REQUESTS") {
    return "Demasiados intentos. Espera un minuto y vuelve a intentar.";
  }
  return "Correo o contraseña incorrectos.";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, email };
  }

  // Límite de intentos (ver login-throttle.ts: el de Better Auth no aplica aquí).
  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders);
  const waitMinutes = loginThrottle.blockedFor(parsed.data.email, ip);
  if (waitMinutes) {
    return { error: `Demasiados intentos fallidos. Espera ${waitMinutes} min y vuelve a intentar.`, email };
  }

  try {
    await auth.api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password, rememberMe: true },
      headers: requestHeaders,
    });
  } catch (error) {
    if (error instanceof APIError) {
      // «Desactivado» solo sale con la contraseña correcta: no es un intento fallido.
      if (error.message !== "USUARIO_INACTIVO") loginThrottle.fail(parsed.data.email, ip);
      return { error: loginErrorMessage(error), email };
    }
    throw error;
  }
  loginThrottle.succeed(parsed.data.email);

  redirect(safeNextPath(parsed.data.next));
}

export async function logout() {
  await auth.api.signOut({ headers: await headers() });
  // ?salir evita que el login automático de desarrollo vuelva a entrar solo.
  redirect("/login?salir=1");
}
