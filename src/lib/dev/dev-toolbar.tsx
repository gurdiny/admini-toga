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
    <div className="bg-card/95 fixed right-3 bottom-20 z-50 md:bottom-3 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-sm backdrop-blur">
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
