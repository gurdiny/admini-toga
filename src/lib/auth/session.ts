import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import type { Role } from "@/generated/prisma/client";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

/** Se lanza cuando una Server Action se ejecuta sin sesión o sin el rol requerido. */
export class AuthorizationError extends Error {
  constructor(message = "No tienes permiso para hacer esto.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * Usuario de la sesión actual, o null. Se memoriza por request: llamarlo en el
 * layout, la página y la acción cuesta una sola consulta.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const { id, name, email, role, isActive } = session.user;
  // Un usuario desactivado con una sesión abierta queda fuera en su siguiente request.
  if (!isActive) return null;
  return { id, name, email, role: role as Role };
});

/** OWNER puede todo lo que puede STAFF. */
export function hasRole(user: CurrentUser, role: Role): boolean {
  return user.role === "OWNER" || user.role === role;
}

// ─── Para layouts y páginas: redirigen ─────────────────────────────────────

/** Exige sesión; si no hay, manda a /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Exige un rol; sin sesión manda a /login, sin permiso manda al inicio. */
export async function requirePageRole(role: Role): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasRole(user, role)) redirect("/");
  return user;
}

// ─── Para Server Actions: lanzan AuthorizationError ────────────────────────

/** Primera línea de toda Server Action. Lanza si no hay sesión o falta el rol. */
export async function requireRole(role: Role): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError("Tu sesión expiró. Vuelve a iniciar sesión.");
  if (!hasRole(user, role)) throw new AuthorizationError();
  return user;
}
