"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ADMIN_SECTIONS } from "../sections";

/** Celular: píldoras que se deslizan. Escritorio (lg): barra lateral. */
export function AdminNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // En celular las píldoras se deslizan: la sección actual siempre a la vista.
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && active) nav.scrollTo({ left: active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2, behavior: "smooth" });
  }, [pathname]);

  return (
    // En el inicio del panel las tarjetas ya son la navegación: las píldoras solo en escritorio.
    <nav
      ref={navRef}
      aria-label="Administración"
      className={cn("-mx-4 overflow-x-auto px-4 lg:mx-0 lg:block lg:overflow-visible lg:px-0", pathname === "/admin" && "hidden")}
    >
      <ul className="flex gap-2 lg:flex-col lg:gap-1">
        {ADMIN_SECTIONS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-2 rounded-full px-4 text-sm whitespace-nowrap",
                  active ? "bg-card shadow-toga-sm font-bold" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className={cn("size-4", active && "text-toga-pink-strong")} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
