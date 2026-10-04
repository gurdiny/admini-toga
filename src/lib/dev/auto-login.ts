// Inicio de sesión automático SOLO en desarrollo (npm run dev).
// En producción (`next build`/`next start`) NODE_ENV es "production" y todo
// esto queda apagado: la ruta responde 404 y el proxy manda a /login normal.

export const DEV_PASSWORD = process.env.SEED_PASSWORD ?? "joyeria-dev-2026";

/** Correo con el que entrar solo. Vacío o en producción = apagado. */
export function devAutoLoginEmail(): string | null {
  if (process.env.NODE_ENV !== "development") return null;
  return process.env.DEV_AUTO_LOGIN?.trim() || null;
}

export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

/** URL que inicia sesión como `email` y regresa a `next`. */
export function devLoginUrl(next: string, email?: string): string {
  const params = new URLSearchParams({ next });
  if (email) params.set("as", email);
  return `/api/dev/login?${params}`;
}
