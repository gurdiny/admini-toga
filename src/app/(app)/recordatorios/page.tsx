import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, CalendarClock, CircleCheckBig, PartyPopper } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { canDelete, canEdit } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { formatDay, getToday, getTomorrow } from "@/lib/date";
import { cn } from "@/lib/utils";
import { BUCKET_LABELS, BUCKETS, bucketHref, COMPLETED_WINDOW_DAYS, parseBucket, type Bucket } from "@/modules/reminders/buckets";
import { NewReminderButton } from "@/modules/reminders/components/new-reminder-button";
import { ReminderList, type ReminderRow } from "@/modules/reminders/components/reminder-list";
import { getReminderCounts, getReminders, type ReminderItem } from "@/modules/reminders/queries";

export const metadata: Metadata = { title: "Recordatorios" };

const EMPTY: Record<Bucket, { icon: typeof CalendarClock; title: string; description: string }> = {
  manana: {
    icon: CalendarClock,
    title: "Nada para mañana",
    description: "Cuando captures un pedido para mañana aparecerá aquí.",
  },
  hoy: {
    icon: CalendarCheck,
    title: "Nada pendiente para hoy",
    description: "Los pedidos de hoy ya están completos o no hay ninguno.",
  },
  atrasados: {
    icon: PartyPopper,
    title: "Todo al corriente",
    description: "No hay pedidos atrasados.",
  },
  completados: {
    icon: CircleCheckBig,
    title: "Sin completados recientes",
    description: `Aquí se ven los pedidos completados en los últimos ${COMPLETED_WINDOW_DAYS} días.`,
  },
};

export default async function RemindersPage({ searchParams }: PageProps<"/recordatorios">) {
  const user = await requireUser();
  const bucket = parseBucket((await searchParams).vista);
  // Un solo «ahora» para toda la página: contadores y listas no se desfasan a medianoche.
  const now = new Date();

  const [counts, items, later] = await Promise.all([
    getReminderCounts(now),
    getReminders(bucket, now),
    bucket === "manana" ? getReminders("despues", now) : null,
  ]);
  // Permisos por fila calculados aquí; el cliente solo recibe booleanos.
  const withPermissions = (list: ReminderItem[]): ReminderRow[] =>
    list.map((item) => ({ ...item, canEdit: canEdit(user, item, now), canDelete: canDelete(user, item, now) }));

  const dayTitle =
    bucket === "manana" ? formatDay(getTomorrow(now), "EEEE d 'de' MMMM") : bucket === "hoy" ? formatDay(getToday(now), "EEEE d 'de' MMMM") : null;
  const empty = EMPTY[bucket];

  return (
    <>
      <PageHeader
        title="Recordatorios"
        description="Pedidos de clientes por entregar o avisar."
        actions={<NewReminderButton className="hidden md:inline-flex" />}
      />

      <nav className="bg-muted mb-4 grid grid-cols-4 gap-1 rounded-2xl p-1" aria-label="Pestañas de recordatorios">
        {BUCKETS.map((b) => {
          const active = b === bucket;
          const alert = b === "atrasados" && counts.atrasados > 0;
          return (
            <Link
              key={b}
              href={bucketHref(b)}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center rounded-xl px-1 leading-tight",
                active && "bg-card shadow-toga-sm",
                alert && "text-destructive",
                alert && !active && "bg-destructive/10",
              )}
            >
              <span className={cn("text-lg tabular-nums", active || alert ? "font-bold" : "text-muted-foreground")}>{counts[b]}</span>
              <span className={cn("text-[12px]", active && "font-bold")}>{BUCKET_LABELS[b]}</span>
            </Link>
          );
        })}
      </nav>

      {/* En celular la captura va arriba de la lista, a todo lo ancho. */}
      <NewReminderButton className="mb-4 h-12 w-full md:hidden" />

      <section aria-labelledby="lista" className="space-y-3">
        <h2 id="lista" className="text-muted-foreground text-sm first-letter:uppercase">
          {dayTitle ?? (bucket === "completados" ? `Últimos ${COMPLETED_WINDOW_DAYS} días` : "Pendientes de días anteriores")}
        </h2>
        {items.length === 0 ? (
          <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />
        ) : (
          <ReminderList items={withPermissions(items)} showDate={bucket === "atrasados" || bucket === "completados"} />
        )}
      </section>

      {later && later.length > 0 && (
        <section aria-labelledby="despues" className="mt-8 space-y-3">
          <h2 id="despues" className="text-sm font-bold">
            Más adelante <span className="text-muted-foreground font-normal">({later.length})</span>
          </h2>
          <ReminderList items={withPermissions(later)} showDate />
        </section>
      )}
    </>
  );
}
