import Link from "next/link";
import { CalendarCheck, ChevronRight, Wallet } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { canDelete, canEdit, canReschedule, canViewTotals } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { formatDay, getRange, getToday } from "@/lib/date";
import { formatMXN } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { CategoryChart } from "@/modules/dashboard/components/category-chart";
import { BalanceText } from "@/modules/payments/components/balance-text";
import { getPaymentsSummary } from "@/modules/payments/queries";
import { BUCKET_LABELS, bucketHref } from "@/modules/reminders/buckets";
import { ReminderList } from "@/modules/reminders/components/reminder-list";
import { getReminderCounts, getReminders } from "@/modules/reminders/queries";

const TODAY_PREVIEW = 5;

/**
 * Estado del día. Todos ven los pendientes (hoy, mañana, atrasados) y la lista
 * de hoy para palomear desde aquí. El dueño ve además lo pagado en el mes, lo
 * que se debe y el gasto por categoría; el mostrador no ve ningún total.
 */
export default async function Home() {
  const user = await requireUser();
  const { modules } = await getSettings();
  const showTotals = canViewTotals(user) && modules.payments;
  // Un solo «ahora» para toda la página: contadores y listas no se desfasan a medianoche.
  const now = new Date();
  const month = getRange("month", now);

  const [counts, today, summary] = await Promise.all([
    modules.reminders ? getReminderCounts(now) : null,
    modules.reminders ? getReminders("hoy", now) : null,
    showTotals ? getPaymentsSummary(month) : null,
  ]);
  const monthName = formatDay(month.from, "MMMM");

  return (
    <div className="space-y-7">
      <div className="space-y-1">
        <p className="eyebrow first-letter:uppercase">{formatDay(getToday(now), "EEEE d 'de' MMMM")}</p>
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Hola, {user.name}</h1>
      </div>

      {counts && today && (
        <>
          {/* La placa de plata: lo pendiente del día, grabado. */}
          <section aria-label="Pendientes" className="plate px-1 pt-3 pb-2">
            <div className="flex items-center justify-between px-3">
              <p className="text-[0.6875rem] font-bold tracking-[0.12em] text-plata-ink/70 uppercase">Pendientes</p>
              <span className="hallmark-925" aria-hidden>
                925
              </span>
            </div>
            <div className="mt-1 grid grid-cols-3 md:grid-cols-[repeat(3,minmax(0,11rem))]">
              {(["hoy", "manana", "atrasados"] as const).map((bucket, i) => {
                const alert = bucket === "atrasados" && counts.atrasados > 0;
                return (
                  <Link
                    key={bucket}
                    href={bucketHref(bucket)}
                    className={cn("min-w-0 px-3 py-2 transition-colors hover:bg-white/40 active:bg-white/60", i > 0 && "plate-rule border-l")}
                  >
                    <p
                      className={cn(
                        "font-heading text-[2.5rem] leading-none tabular-nums",
                        alert ? "text-destructive" : counts[bucket] === 0 && "text-plata-ink/45",
                      )}
                    >
                      {counts[bucket]}
                    </p>
                    <p className={cn("mt-1 flex items-center gap-1.5 truncate text-sm font-bold", alert && "text-destructive")}>
                      {alert && <span className="bg-destructive size-1.5 shrink-0 rounded-full" aria-hidden />}
                      {BUCKET_LABELS[bucket]}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="hoy" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 id="hoy" className="font-bold">
                Para hoy
              </h2>
              {today.length > 0 && (
                <Link href={bucketHref("hoy")} className="text-toga-pink-strong inline-flex min-h-10 items-center gap-0.5 text-sm font-bold">
                  {today.length > TODAY_PREVIEW ? `Ver los ${today.length}` : "Abrir Hoy"}
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              )}
            </div>
            {today.length === 0 ? (
              <EmptyState
                icon={CalendarCheck}
                title="Nada pendiente para hoy"
                description={counts.atrasados > 0 ? "Pero hay pedidos atrasados por revisar." : "Los pedidos de hoy ya están completos o no hay ninguno."}
                action={
                  counts.atrasados > 0 && (
                    <Button asChild variant="outline" className="text-destructive">
                      <Link href={bucketHref("atrasados")}>
                        Ver {counts.atrasados} atrasado{counts.atrasados === 1 ? "" : "s"}
                        <ChevronRight aria-hidden />
                      </Link>
                    </Button>
                  )
                }
              />
            ) : (
              <ReminderList
                items={today.slice(0, TODAY_PREVIEW).map((item) => ({ ...item, canEdit: canEdit(user, item, now), canReschedule: canReschedule(user, item), canDelete: canDelete(user, item, now) }))}
              />
            )}
          </section>
        </>
      )}

      {summary && (
        <section aria-labelledby="mes" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="mes" className="font-bold first-letter:uppercase">
              {monthName}
            </h2>
            <Link href="/pagos?rango=mes" className="text-toga-pink-strong inline-flex min-h-10 items-center gap-0.5 text-sm font-bold">
              Pagos del mes
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="bg-card shadow-toga grid grid-cols-2 rounded-2xl">
            <div className="min-w-0 space-y-1 p-4">
              <p className="text-muted-foreground text-xs">Pagado en {monthName}</p>
              <p className="font-heading truncate text-xl leading-tight tabular-nums">{formatMXN(summary.totalPaid)}</p>
              <p className="text-muted-foreground text-xs">
                {summary.count} pago{summary.count === 1 ? "" : "s"}
              </p>
            </div>
            <div className="min-w-0 space-y-1 border-l p-4">
              <p className="text-muted-foreground text-xs">Por pagar hoy</p>
              <p className="font-heading truncate text-xl leading-tight tabular-nums">
                <BalanceText balances={summary.totalOwed} />
              </p>
              <p className="text-muted-foreground text-xs">a todos los proveedores</p>
            </div>
          </div>

          <div className="bg-card shadow-toga min-w-0 rounded-2xl p-4">
            <h3 className="mb-3 text-sm font-bold">Gasto por categoría</h3>
            {summary.count === 0 ? (
              <div className="text-muted-foreground flex flex-col items-center gap-2 py-6 text-center text-sm">
                <Wallet className="size-6" aria-hidden />
                Aún no hay pagos en {monthName}.
              </div>
            ) : (
              <CategoryChart
                data={summary.byCategory.map((row) => ({ id: row.id, name: row.name, color: row.color ?? "", total: row.total, count: row.count }))}
                total={summary.totalPaid}
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}
