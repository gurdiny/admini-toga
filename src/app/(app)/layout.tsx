import Link from "next/link";
import { LogOut } from "lucide-react";
import { TogaWordmark } from "@/components/brand/toga-logo";
import { AppNav } from "@/components/app-nav";
import { logout } from "@/lib/auth/actions";
import { canAdminister } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DevToolbar } from "@/lib/dev/dev-toolbar";

// Todo lo que está bajo (app) exige sesión. Esta es la verificación real;
// el proxy solo redirige por comodidad.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const isOwner = canAdminister(user);

  return (
    <>
      <header className="bg-card sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center" aria-label="Inicio">
            <TogaWordmark priority className="h-6 w-auto" />
          </Link>
          <AppNav isOwner={isOwner} variant="top" />
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm sm:inline">{user.name}</span>
            <Badge variant="secondary" className={isOwner ? "bg-toga-green-soft text-toga-green-strong" : undefined}>
              {isOwner ? "Dueño" : "Mostrador"}
            </Badge>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="icon" aria-label="Cerrar sesión">
                <LogOut aria-hidden />
              </Button>
            </form>
          </div>
        </div>
      </header>
      {/* pb-24 en celular: deja espacio para la barra de navegación inferior. */}
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col p-4 pb-24 md:pb-8">{children}</div>
      <AppNav isOwner={isOwner} variant="bottom" />
      <DevToolbar user={user} />
    </>
  );
}
