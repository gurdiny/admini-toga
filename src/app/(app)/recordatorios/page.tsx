import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, CalendarClock, CircleCheckBig, PartyPopper, Search, SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ExportMenu } from "@/components/export-menu";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { canDelete, canEdit, canReschedule } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { formatDay, getToday, getTomorrow } from "@/lib/date";
import { getSettings, requireModule } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { BUCKET_LABELS, BUCKETS, bucketHref, classifyReminder, COMPLETED_WINDOW_DAYS, parseBucket, type Bucket } from "@/modules/reminders/buckets";
import { NewReminderButton } from "@/modules/reminders/components/new-reminder-button";
import { ReminderList, type ReminderRow } from "@/modules/reminders/components/reminder-list";
import { getReminderCounts, getReminders, searchReminders, type ReminderItem } from "@/modules/reminders/queries";

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
  await requireModule("reminders");
  const user = await requireUser();
  const params = await searchParams;
  const bucket = parseBucket(params.vista);
  const q = (typeof params.q === "string" ? params.q : "").trim();
  // ?todos=1: Atrasados sin el límite de días de Configuración.
  const allOverdue = bucket === "atrasados" && params.todos === "1";
  // Un solo «ahora» para toda la página: contadores y listas no se desfasan a medianoche.
  const now = new Date();

  const [counts, items, later, settings, found] = await Promise.all([
    getReminderCounts(now, { allOverdue }),
    q ? [] : getReminders(bucket, now, { allOverdue }),
    bucket === "manana" && !q ? getReminders("despues", now) : null,
    getSettings(),
    q ? searchReminders(q) : null,
  ]);
  // Permisos por fila calculados aquí; el cliente solo recibe booleanos.
  const withPermissions = (list: ReminderItem[]): ReminderRow[] =>
    list.map((item) => ({ ...item, canEdit: canEdit(user, item, now), canReschedule: canReschedule(user, item), canDelete: canDelete(user, item, now) }));

  const dayTitle =
    bucket === "manana" ? formatDay(getTomorrow(now), "EEEE d 'de' MMMM") : bucket === "hoy" ? formatDay(getToday(now), "EEEE d 'de' MMMM") : null;
  const empty = EMPTY[bucket];
  const exportParams = new URLSearchParams({ ...(bucket !== "manana" && { vista: bucket }), ...(allOverdue && { todos: "1" }) }).toString();
  const exportHref = `/api/exportar/recordatorios${exportParams ? `?${exportParams}` : ""}`;

  return (
    <>
      <PageHeader
        title="Recordatorios"
        description="Pedidos de clientes por entregar o avisar."
        actions={<NewReminderButton className="hidden md:inline-flex" />}
      />

      <form className="mb-3" role="search">
        {bucket !== "manana" && <input type="hidden" name="vista" value={bucket} />}
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" aria-hidden />
          <Input
            name="q"
            type="search"
            enterKeyHint="search"
            defaultValue={q}
            placeholder="Buscar cliente, folio, teléfono o pedido"
            aria-label="Buscar recordatorio"
            className="bg-card h-12 rounded-full pl-10"
          />
        </div>
      </form>

      <nav className="bg-muted mb-4 grid grid-cols-4 gap-1 rounded-2xl p-1" aria-label="Pestañas de recordatorios">
        {BUCKETS.map((b) => {
          const active = b === bucket && !q;
          const alert = b === "atrasados" && counts.atrasados > 0;
          return (
            <Link
              key={b}
              href={bucketHref(b)}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 min-w-0 flex-col items-center justify-center rounded-xl px-0.5 leading-tight",
                active && "bg-card shadow-toga-sm",
                alert && "text-destructive",
                alert && !active && "bg-destructive/10",
              )}
            >
              <span className={cn("text-lg tabular-nums", active || alert ? "font-bold" : "text-muted-foreground")}>{counts[b]}</span>
              <span className={cn("text-[11px] min-[380px]:text-[12px]", active && "font-bold")}>{BUCKET_LABELS[b]}</span>
            </Link>
          );
        })}
      </nav>

      {/* En celular la captura va arriba de la lista, a todo lo ancho. */}
      <NewReminderButton className="mb-4 h-12 w-full md:hidden" />

      {found ? (
        <section aria-labelledby="resultados" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <h2 id="resultados" className="text-muted-foreground text-sm">
              {found.length === 0
                ? `Nada coincide con «${q}»`
                : `${found.length}${found.length === 60 ? "+" : ""} resultado${found.length === 1 ? "" : "s"} para «${q}»`}
            </h2>
            <div className="flex items-center gap-3">
              <Link href={bucketHref(bucket)} className="text-toga-pink-strong inline-flex min-h-10 items-center text-sm font-bold">
                Quitar búsqueda
              </Link>
              {found.length > 0 && (
                <ExportMenu href={`/api/exportar/recordatorios?q=${encodeURIComponent(q)}`} description={`Todos los pedidos que coinciden con «${q}».`} />
              )}
            </div>
          </div>
          {found.length === 0 ? (
            <EmptyState icon={SearchX} title={`Ningún pedido coincide con «${q}»`} description="Prueba con el folio (CLI-0005), el teléfono o una palabra del pedido." />
          ) : (
            <ReminderList items={withPermissions(found).map((item) => ({ ...item, placement: classifyReminder(item, now) }))} showDate />
          )}
        </section>
      ) : (
        <section aria-labelledby="lista" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="lista" className="text-muted-foreground text-sm first-letter:uppercase">
              {dayTitle ?? (bucket === "completados" ? `Últimos ${COMPLETED_WINDOW_DAYS} días` : "Pendientes de días anteriores")}
            </h2>
            {(items.length > 0 || (later?.length ?? 0) > 0) && (
              <ExportMenu
                href={exportHref}
                description={
                  bucket === "manana"
                    ? "Lo de mañana y lo de más adelante."
                    : `Todo lo de «${BUCKET_LABELS[bucket]}»${allOverdue ? ", sin límite de días" : ""}.`
                }
              />
            )}
          </div>
          {items.length === 0 ? (
            <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />
          ) : (
            <ReminderList items={withPermissions(items)} showDate={bucket === "atrasados" || bucket === "completados"} />
          )}
          {bucket === "atrasados" && (counts.antiguos > 0 || allOverdue) && (
            <p className="bg-card shadow-toga flex flex-wrap items-center justify-between gap-x-3 rounded-2xl px-4 py-2 text-sm">
              <span className="text-muted-foreground py-2">
                {allOverdue
                  ? "Mostrando todos los atrasados."
                  : `${counts.antiguos} pedido${counts.antiguos === 1 ? "" : "s"} de hace más de ${settings.overdueLookbackDays} días no ${counts.antiguos === 1 ? "se muestra" : "se muestran"}.`}
              </span>
              <Link
                href={allOverdue ? bucketHref("atrasados") : `${bucketHref("atrasados")}&todos=1`}
                scroll={false}
                className="text-toga-pink-strong inline-flex min-h-10 items-center font-bold"
              >
                {allOverdue ? `Solo los últimos ${settings.overdueLookbackDays} días` : "Verlos"}
              </Link>
            </p>
          )}
        </section>
      )}

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
