import Link from "next/link";
import { Button } from "@/components/ui/button";
import { devLoginUrl, isDevelopment } from "@/lib/dev/auto-login";

export const DEV_USERS = [
  { email: "dueno@joyeria.local", label: "Dueño" },
  { email: "mostrador@joyeria.local", label: "Mostrador" },
] as const;

/** Botones de acceso rápido en /login. Solo se renderizan en desarrollo. */
export function DevLoginShortcuts({ next, error }: { next?: string; error?: string }) {
  if (!isDevelopment()) return null;
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3 text-center text-sm">
      <p className="text-muted-foreground">Solo desarrollo · entrar como:</p>
      {error && (
        <p className="text-destructive">
          No se pudo entrar como {error}. ¿Corriste <code>npm run db:seed</code>?
        </p>
      )}
      <div className="flex justify-center gap-2">
        {DEV_USERS.map((user) => (
          <Button key={user.email} asChild variant="outline" size="sm">
            <Link href={devLoginUrl(next ?? "/", user.email)} prefetch={false}>
              {user.label}
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
