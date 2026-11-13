"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, ChevronRight, ClipboardCheck, Home, Layers, LogOut, Menu, Plus, Settings, Tags, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { logout } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import { DevUserSwitch } from "@/lib/dev/dev-toolbar";
import type { PaymentMethod } from "@/generated/prisma/browser";
import { PAYMENT_VIEW_LABELS, viewHref, type PaymentView } from "@/modules/payments/filters";
import { OtherPaymentFormDialog } from "@/modules/payments/components/other-payment-form-dialog";
import { PaymentFormDialog } from "@/modules/payments/components/payment-form-dialog";
import type { CaptureOptions } from "@/modules/payments/queries";

/** Pendientes de hoy + atrasados, para el globo de «Recordatorios». */
export type ReminderBadge = { count: number; overdue: boolean };

export type Modules = { payments: boolean; reminders: boolean };

type NavProps = {
  isOwner: boolean;
  modules: Modules;
  reminders: ReminderBadge;
  userName: string;
  options: CaptureOptions;
  defaultMethod: PaymentMethod;
  /** Solo en desarrollo: correo del usuario, para cambiar de usuario desde el menú. */
  devEmail?: string;
};

const HOME = { href: "/", label: "Inicio", icon: Home } as const;
const REMINDERS = { href: "/recordatorios", label: "Recordatorios", icon: ClipboardCheck } as const;
const PAYMENTS = { href: "/pagos", label: "Pagos", icon: Wallet } as const;
const SUPPLIERS = { href: "/proveedores", label: "Proveedores", icon: Truck } as const;
const CATEGORIES = { href: "/categorias", label: "Categorías", icon: Tags } as const;
const MAIN_LINKS = [HOME, REMINDERS, PAYMENTS, SUPPLIERS, CATEGORIES] as const;
const PAYMENT_LINKS: readonly string[] = [PAYMENTS.href, SUPPLIERS.href, CATEGORIES.href];

/** Enlaces de los módulos encendidos en Configuración. Proveedores y Categorías son parte de Pagos. */
function visibleLinks(modules: Modules) {
  return MAIN_LINKS.filter((link) =>
    link === REMINDERS ? modules.reminders : PAYMENT_LINKS.includes(link.href) ? modules.payments : true,
  );
}

/** Pantallas que en celular solo se abren desde «Menú»: ahí se marca la pestaña. */
const inMenu = (pathname: string) => pathname === "/" || isActive(pathname, "/admin") || isActive(pathname, CATEGORIES.href);

const ADMIN_LINK = { href: "/admin", label: "Administración", icon: Settings } as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Navegación de escritorio, dentro del encabezado. */
export function TopNav({ isOwner, modules, reminders }: { isOwner: boolean; modules: Modules; reminders: ReminderBadge }) {
  const pathname = usePathname();
  const links = [...visibleLinks(modules), ...(isOwner ? [{ ...ADMIN_LINK, label: "Admin" }] : [])];
  return (
    <nav className="hidden items-center gap-1 text-sm md:flex" aria-label="Principal">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={isActive(pathname, link.href) ? "page" : undefined}
          className={cn(
            "hover:bg-muted rounded-full px-3 py-2 lg:px-4",
            isActive(pathname, link.href) && "bg-toga-green-soft font-bold",
          )}
        >
          {link.label}
          {link.href === REMINDERS.href && <CountBadge badge={reminders} className="ml-1.5" />}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Celular: barra fija abajo como la de toga.mx. «Pagos» abre el menú de sus
 * tres listas. En el centro, el botón para registrar un pago desde cualquier
 * pantalla: pregunta si es a un proveedor o sin proveedor (dentro de un
 * proveedor, ya viene con ese proveedor elegido). Inicio está en «Menú» y en
 * el logo.
 */
export function BottomNav({ isOwner, modules, reminders, userName, options, defaultMethod, devEmail }: NavProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [currentView, setCurrentView] = useState<PaymentView | null>(null);
  const supplierId = pathname.match(/^\/proveedores\/([^/]+)$/)?.[1];

  function openPayments() {
    // La lista actual se lee al abrir (sin useSearchParams, que obligaría a un Suspense en el layout).
    const ver = new URLSearchParams(window.location.search).get("ver");
    setCurrentView(pathname === PAYMENTS.href ? ((PAYMENT_VIEWS_MENU.some((v) => v.view === ver) ? ver : "proveedores") as PaymentView) : null);
    setPaymentsOpen(true);
  }

  return (
    <>
      <nav
        className="bg-card/95 shadow-toga fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Principal"
      >
        {/* Columnas según los módulos encendidos: Recordatorios · Pagos · ➕ · Proveedores · Menú. */}
        {/* El botón central ocupa lo justo (4.5rem): el resto del ancho es para las etiquetas. */}
        <ul
          className="grid h-16 items-center"
          style={{
            gridTemplateColumns: [
              ...(modules.reminders ? ["minmax(0,1fr)"] : []),
              ...(modules.payments ? ["minmax(0,1fr)", "4.5rem", "minmax(0,1fr)"] : []),
              "minmax(0,1fr)",
            ].join(" "),
          }}
        >
          {modules.reminders && <TabLink {...REMINDERS} active={isActive(pathname, REMINDERS.href)} badge={reminders} />}
          {modules.payments && (
            <>
              {/* «Pagos» abre el menú de las tres listas (a proveedores, sin proveedor, todos). */}
              <li>
                <button
                  type="button"
                  onClick={openPayments}
                  aria-haspopup="dialog"
                  className={cn(
                    "flex h-16 w-full min-w-0 flex-col items-center justify-center gap-1 text-[10px] tracking-tight min-[380px]:text-[11px]",
                    isActive(pathname, PAYMENTS.href) ? "text-foreground font-bold" : "text-muted-foreground",
                  )}
                >
                  <TabIcon icon={PAYMENTS.icon} active={isActive(pathname, PAYMENTS.href)} />
                  <span className="block max-w-full truncate px-0.5">{PAYMENTS.label}</span>
                </button>
              </li>
              <li className="flex justify-center">
                {/* Dentro de un proveedor el pago ya es para él; en cualquier otra pantalla se pregunta. */}
                {supplierId ? (
                  <PaymentFormDialog key={supplierId} options={options} defaultMethod={defaultMethod} preset={{ supplierId }} trigger={<PlusButton />} />
                ) : (
                  <NewPaymentChooser options={options} defaultMethod={defaultMethod} />
                )}
              </li>
              <TabLink {...SUPPLIERS} active={isActive(pathname, SUPPLIERS.href)} />
            </>
          )}
          <li>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className={cn(
                "flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] tracking-tight",
                inMenu(pathname) ? "text-foreground font-bold" : "text-muted-foreground",
              )}
            >
              <TabIcon icon={Menu} active={inMenu(pathname)} />
              <span className="block max-w-full truncate px-0.5">Menú</span>
            </button>
          </li>
        </ul>
      </nav>

      <Dialog open={paymentsOpen} onOpenChange={setPaymentsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Pagos</DialogTitle>
            <DialogDescription>¿Qué lista quieres ver?</DialogDescription>
          </DialogHeader>
          <ul className="divide-y rounded-2xl border">
            {PAYMENT_VIEWS_MENU.map(({ view, icon: Icon, detail }) => {
              const active = currentView === view;
              return (
                <li key={view}>
                  <Link
                    href={viewHref(view)}
                    onClick={() => setPaymentsOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className="flex min-h-14 items-center gap-3 px-4 py-2 text-sm"
                  >
                    <Icon className={cn("text-muted-foreground size-[18px] shrink-0", active && "text-toga-pink-strong")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block", active && "font-bold")}>{PAYMENT_VIEW_LABELS[view].title}</span>
                      <span className="text-muted-foreground block text-xs">{detail}</span>
                    </span>
                    <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{userName}</DialogTitle>
            <DialogDescription>{isOwner ? "Dueño" : "Mostrador"}</DialogDescription>
          </DialogHeader>
          <ul className="divide-y rounded-2xl border">
            {[...visibleLinks(modules), ...(isOwner ? [ADMIN_LINK] : [])].map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive(pathname, href) ? "page" : undefined}
                  className={cn("flex min-h-12 items-center gap-3 px-4 text-sm", isActive(pathname, href) && "font-bold")}
                >
                  <Icon className={cn("text-muted-foreground size-[18px]", isActive(pathname, href) && "text-toga-pink-strong")} aria-hidden />
                  {label}
                  {href === REMINDERS.href && <CountBadge badge={reminders} className="ml-auto" />}
                </Link>
              </li>
            ))}
          </ul>
          {devEmail && <DevUserSwitch email={devEmail} />}
          <form action={logout}>
            <Button type="submit" variant="outline" className="h-11 w-full">
              <LogOut aria-hidden />
              Cerrar sesión
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

const PAYMENT_VIEWS_MENU: { view: PaymentView; icon: typeof Home; detail: string }[] = [
  { view: "proveedores", icon: Truck, detail: "Contado y abonos a sus notas" },
  { view: "sin-proveedor", icon: Banknote, detail: "Solo cantidad, nota, día y hora" },
  { view: "todos", icon: Layers, detail: "Los dos juntos" },
];

/** El botón rosa del centro. */
function PlusButton(props: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label="Nuevo pago"
      className="bg-toga-pink-strong shadow-toga-sm -mt-6 flex size-14 items-center justify-center rounded-full text-white ring-4 ring-[var(--background)] active:scale-95"
      {...props}
    >
      <Plus className="size-7" strokeWidth={2.5} aria-hidden />
    </button>
  );
}

/**
 * ➕ fuera de un proveedor: pregunta si el pago es a un proveedor o sin
 * proveedor y abre el formulario que toca. Los formularios son diálogos
 * aparte (no anidados): el que elige se cierra antes de abrir el otro.
 */
function NewPaymentChooser({ options, defaultMethod }: { options: CaptureOptions; defaultMethod: PaymentMethod }) {
  const [choosing, setChoosing] = useState(false);
  const [form, setForm] = useState<"supplier" | "other" | null>(null);
  const choose = (next: "supplier" | "other") => {
    setChoosing(false);
    setForm(next);
  };
  const choices = [
    { key: "supplier" as const, icon: Truck, title: "Pago a proveedor", detail: "De contado o abono a lo que se le debe" },
    { key: "other" as const, icon: Banknote, title: "Pago sin proveedor", detail: "Solo cantidad y nota" },
  ];

  return (
    <>
      <PlusButton onClick={() => setChoosing(true)} aria-haspopup="dialog" />
      <Dialog open={choosing} onOpenChange={setChoosing}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo pago</DialogTitle>
            <DialogDescription>¿A quién le estás pagando?</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {choices.map(({ key, icon: Icon, title, detail }) => (
              <button
                key={key}
                type="button"
                onClick={() => choose(key)}
                className="bg-card hover:bg-muted flex min-h-16 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left"
              >
                <span className="bg-toga-pink-soft text-toga-pink-strong flex size-10 shrink-0 items-center justify-center rounded-full" aria-hidden>
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{title}</span>
                  <span className="text-muted-foreground block text-xs">{detail}</span>
                </span>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <PaymentFormDialog
        open={form === "supplier"}
        onOpenChange={(open) => !open && setForm(null)}
        options={options}
        defaultMethod={defaultMethod}
      />
      <OtherPaymentFormDialog open={form === "other"} onOpenChange={(open) => !open && setForm(null)} />
    </>
  );
}

function TabLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
  badge?: ReminderBadge;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-16 min-w-0 flex-col items-center justify-center gap-1 text-[10px] tracking-tight min-[380px]:text-[11px]",
          active ? "text-foreground font-bold" : "text-muted-foreground",
        )}
      >
        <span className="relative">
          <TabIcon icon={Icon} active={active} />
          {badge && <CountBadge badge={badge} className="absolute -top-1.5 left-7 ring-2 ring-[var(--card)]" />}
        </span>
        {/* Si el navegador agranda la letra (Brave en iPhone), se recorta con «…» en vez de salirse. */}
        <span className="block max-w-full truncate px-0.5">{label}</span>
      </Link>
    </li>
  );
}

/** Ícono de la pestaña; la activa lleva una cápsula rosa detrás. */
function TabIcon({ icon: Icon, active }: { icon: typeof Home; active: boolean }) {
  return (
    <span
      className={cn(
        "flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200",
        active && "bg-toga-pink-soft text-toga-pink-strong",
      )}
    >
      <Icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
    </span>
  );
}

/** Globo con los pendientes de hoy + atrasados; rojo si hay atrasados. */
function CountBadge({ badge, className }: { badge: ReminderBadge; className?: string }) {
  if (badge.count === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-none font-bold text-white tabular-nums",
        badge.overdue ? "bg-destructive" : "bg-toga-pink-strong",
        className,
      )}
    >
      {badge.count > 99 ? "99+" : badge.count}
      <span className="sr-only"> pendientes{badge.overdue ? ", hay atrasados" : ""}</span>
    </span>
  );
}
