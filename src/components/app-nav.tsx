"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LogOut, Menu, Plus, Settings, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { logout } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import { DevUserSwitch } from "@/lib/dev/dev-toolbar";
import type { PaymentMethod } from "@/generated/prisma/browser";
import { PaymentFormDialog } from "@/modules/payments/components/payment-form-dialog";
import type { CaptureOptions } from "@/modules/payments/queries";

type NavProps = {
  isOwner: boolean;
  userName: string;
  options: CaptureOptions;
  defaultMethod: PaymentMethod;
  /** Solo en desarrollo: correo del usuario, para cambiar de usuario desde el menú. */
  devEmail?: string;
};

const MAIN_LINKS = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/pagos", label: "Pagos", icon: Wallet },
  { href: "/proveedores", label: "Proveedores", icon: Truck },
] as const;

const ADMIN_LINK = { href: "/admin", label: "Administración", icon: Settings } as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Navegación de escritorio, dentro del encabezado. */
export function TopNav({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname();
  const links = isOwner ? [...MAIN_LINKS, { ...ADMIN_LINK, label: "Admin" }] : MAIN_LINKS;
  return (
    <nav className="hidden items-center gap-1 text-sm md:flex" aria-label="Principal">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={isActive(pathname, link.href) ? "page" : undefined}
          className={cn(
            "hover:bg-muted rounded-full px-4 py-2",
            isActive(pathname, link.href) && "bg-toga-green-soft font-bold",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Celular: barra fija abajo como la de toga.mx. En el centro, el botón para
 * registrar un pago desde cualquier pantalla (dentro de un proveedor, ya viene
 * con ese proveedor elegido).
 */
export function BottomNav({ isOwner, userName, options, defaultMethod, devEmail }: NavProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const supplierId = pathname.match(/^\/proveedores\/([^/]+)$/)?.[1];
  const [pagos, proveedores] = [MAIN_LINKS[1], MAIN_LINKS[2]];

  return (
    <>
      <nav
        className="bg-card/95 shadow-toga fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Principal"
      >
        <ul className="grid h-16 grid-cols-5 items-center">
          <TabLink {...MAIN_LINKS[0]} active={isActive(pathname, "/")} />
          <TabLink {...pagos} active={isActive(pathname, pagos.href)} />
          <li className="flex justify-center">
            <PaymentFormDialog
              key={supplierId ?? "general"}
              options={options}
              defaultMethod={defaultMethod}
              preset={supplierId ? { supplierId } : undefined}
              trigger={
                <button
                  type="button"
                  aria-label="Registrar pago"
                  className="bg-toga-pink-strong shadow-toga-sm -mt-6 flex size-14 items-center justify-center rounded-full text-white ring-4 ring-[var(--background)] active:scale-95"
                >
                  <Plus className="size-7" strokeWidth={2.5} aria-hidden />
                </button>
              }
            />
          </li>
          <TabLink {...proveedores} active={isActive(pathname, proveedores.href)} />
          <li>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className={cn(
                "flex h-16 w-full flex-col items-center justify-center gap-0.5 text-[11px]",
                isActive(pathname, "/admin") ? "text-foreground font-bold" : "text-muted-foreground",
              )}
            >
              <Menu className="size-6" aria-hidden />
              Menú
            </button>
          </li>
        </ul>
      </nav>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{userName}</DialogTitle>
            <DialogDescription>{isOwner ? "Dueño" : "Mostrador"}</DialogDescription>
          </DialogHeader>
          <ul className="divide-y rounded-xl border">
            {[...MAIN_LINKS, ...(isOwner ? [ADMIN_LINK] : [])].map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive(pathname, href) ? "page" : undefined}
                  className={cn("flex min-h-14 items-center gap-3 px-4 text-base", isActive(pathname, href) && "font-bold")}
                >
                  <Icon className="text-muted-foreground size-5" aria-hidden />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          {devEmail && <DevUserSwitch email={devEmail} />}
          <form action={logout}>
            <Button type="submit" variant="outline" size="lg" className="w-full">
              <LogOut aria-hidden />
              Cerrar sesión
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TabLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Home; active: boolean }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-16 flex-col items-center justify-center gap-0.5 text-[11px]",
          active ? "text-foreground font-bold" : "text-muted-foreground",
        )}
      >
        <Icon className={cn("size-6", active && "text-toga-pink-strong")} aria-hidden />
        {label}
      </Link>
    </li>
  );
}
