"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Settings, Truck, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Inicio", icon: Home, ownerOnly: false },
  { href: "/pagos", label: "Pagos", icon: Wallet, ownerOnly: false },
  { href: "/proveedores", label: "Proveedores", icon: Truck, ownerOnly: false },
  { href: "/admin", label: "Admin", icon: Settings, ownerOnly: true },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Navegación: en escritorio dentro del encabezado; en celular, barra fija abajo. */
export function AppNav({ isOwner, variant }: { isOwner: boolean; variant: "top" | "bottom" }) {
  const pathname = usePathname();
  const links = LINKS.filter((link) => isOwner || !link.ownerOnly);

  if (variant === "top") {
    return (
      <nav className="hidden items-center gap-1 text-sm md:flex">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive(pathname, link.href) ? "page" : undefined}
            className={cn(
              "hover:bg-muted rounded-md px-3 py-1.5",
              isActive(pathname, link.href) && "bg-toga-green-soft font-bold",
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="bg-card fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${links.length}, 1fr)` }}>
        {links.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs",
                  active ? "text-foreground font-bold" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("size-5", active && "text-toga-green-strong")} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
