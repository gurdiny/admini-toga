import type { CurrentUser } from "@/lib/auth/session";
import { devLoginUrl, isDevelopment } from "@/lib/dev/auto-login";
import { DEV_USERS } from "@/lib/dev/dev-login-shortcuts";

/**
 * Barra flotante para cambiar de usuario en un clic mientras se prueba.
 * Solo se renderiza en desarrollo. Abajo a la derecha (abajo a la izquierda
 * está el indicador de Next.js).
 */
export function DevToolbar({ user }: { user: CurrentUser }) {
  if (!isDevelopment()) return null;
  return (
    <div className="bg-card/95 fixed right-3 bottom-3 z-50 hidden md:flex flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-sm backdrop-blur">
      <span className="text-muted-foreground">Dev:</span>
      {DEV_USERS.map((devUser) =>
        devUser.email === user.email ? (
          <span key={devUser.email} className="text-toga-green-strong font-bold">
            {devUser.label}
          </span>
        ) : (
          // Recarga completa (no <Link>) para que toda la página use la nueva sesión.
          <a key={devUser.email} href={devLoginUrl("/", devUser.email)} className="underline">
            {devUser.label}
          </a>
        ),
      )}
    </div>
  );
}

/** Versión para el menú del celular. */
export function DevUserSwitch({ email }: { email: string }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-2xl border border-dashed px-3 py-1 text-sm">
      <span className="text-muted-foreground">Dev · entrar como:</span>
      {DEV_USERS.map((devUser) =>
        devUser.email === email ? (
          <span key={devUser.email} className="text-toga-green-strong font-bold">
            {devUser.label}
          </span>
        ) : (
          <a key={devUser.email} href={devLoginUrl("/", devUser.email)} className="inline-flex min-h-10 items-center underline">
            {devUser.label}
          </a>
        ),
      )}
    </div>
  );
}
