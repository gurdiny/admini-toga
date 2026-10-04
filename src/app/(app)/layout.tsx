import Link from "next/link";
import { LogOut } from "lucide-react";
import { TogaWordmark } from "@/components/brand/toga-logo";
import { BottomNav, TopNav } from "@/components/app-nav";
import { logout } from "@/lib/auth/actions";
import { canAdminister } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isDevelopment } from "@/lib/dev/auto-login";
import { DevToolbar } from "@/lib/dev/dev-toolbar";
import { getCaptureOptions } from "@/modules/payments/queries";
import { getReminderBadge } from "@/modules/reminders/queries";

// Todo lo que está bajo (app) exige sesión. Esta es la verificación real;
// el proxy solo redirige por comodidad.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const isOwner = canAdminister(user);
  // Para el botón «+ Registrar pago» de la barra inferior, disponible en todas las pantallas.
  const settings = await getSettings();
  const [options, reminders] = await Promise.all([
    getCaptureOptions(),
    settings.modules.reminders ? getReminderBadge() : { count: 0, overdue: false },
  ]);

  return (
    <>
      <header className="bg-card/95 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center" aria-label="Inicio">
            <TogaWordmark priority className="h-6 w-auto" />
          </Link>
          <TopNav isOwner={isOwner} modules={settings.modules} reminders={reminders} />
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm md:inline">{user.name}</span>
            <Badge variant="secondary" className={isOwner ? "bg-toga-green-soft text-toga-green-strong" : undefined}>
              {isOwner ? "Dueño" : "Mostrador"}
            </Badge>
            {/* En celular, cerrar sesión está en «Menú» de la barra inferior. */}
            <form action={logout} className="hidden md:block">
              <Button type="submit" variant="ghost" size="icon" aria-label="Cerrar sesión">
                <LogOut aria-hidden />
              </Button>
            </form>
          </div>
        </div>
      </header>
      {/* pb-28 en celular: espacio para la barra inferior y su botón central. */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-4 pb-28 md:pt-6 md:pb-10">{children}</main>
      <BottomNav
        isOwner={isOwner}
        modules={settings.modules}
        reminders={reminders}
        userName={user.name}
        options={options}
        defaultMethod={settings.defaultPaymentMethod}
        devEmail={isDevelopment() ? user.email : undefined}
      />
      <DevToolbar user={user} />
    </>
  );
}
