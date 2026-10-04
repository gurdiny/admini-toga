"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { auth } from "@/lib/auth/config";

export type LoginState = { error: string; email: string } | undefined;

const loginSchema = z.object({
  email: z.email("Escribe un correo válido.").trim().toLowerCase(),
  password: z.string().min(1, "Escribe tu contraseña."),
  next: z.string().optional(),
});

/** Solo rutas internas: evita que ?next= mande a otro sitio. */
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

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

  try {
    await auth.api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password, rememberMe: true },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) return { error: loginErrorMessage(error), email };
    throw error;
  }

  redirect(safeNext(parsed.data.next));
}

export async function logout() {
  await auth.api.signOut({ headers: await headers() });
  // ?salir evita que el login automático de desarrollo vuelva a entrar solo.
  redirect("/login?salir=1");
}
