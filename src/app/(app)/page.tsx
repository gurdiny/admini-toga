import Link from "next/link";
import { CalendarCheck, ChevronRight, Wallet } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {user.name}</h1>
        <p className="text-muted-foreground text-sm first-letter:uppercase">{formatDay(getToday(now), "EEEE d 'de' MMMM")}</p>
      </div>

      {counts && today && (
        <>
          <section aria-label="Pendientes" className="grid grid-cols-3 gap-3">
            {(["hoy", "manana", "atrasados"] as const).map((bucket) => {
              const alert = bucket === "atrasados" && counts.atrasados > 0;
              return (
                <Link
                  key={bucket}
                  href={bucketHref(bucket)}
                  className={cn("bg-card shadow-toga min-w-0 rounded-2xl p-4", alert && "ring-destructive/40 text-destructive ring-1")}
                >
                  <p className="text-2xl font-bold tabular-nums">{counts[bucket]}</p>
                  <p className="truncate text-sm">{BUCKET_LABELS[bucket]}</p>
                </Link>
              );
            })}
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
                description={counts.atrasados > 0 ? "Pero hay pedidos atrasados: revísalos en Atrasados." : "Los pedidos de hoy ya están completos o no hay ninguno."}
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
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card shadow-toga min-w-0 space-y-1 rounded-2xl p-4">
              <p className="text-muted-foreground text-xs">Pagado en {monthName}</p>
              <p className="truncate text-xl leading-tight font-bold tabular-nums">{formatMXN(summary.totalPaid)}</p>
              <p className="text-muted-foreground text-xs">
                {summary.count} pago{summary.count === 1 ? "" : "s"}
              </p>
            </div>
            <div className="bg-card shadow-toga ring-destructive/25 min-w-0 space-y-1 rounded-2xl p-4 ring-1">
              <p className="text-muted-foreground text-xs">Por pagar hoy</p>
              <p className="truncate text-xl leading-tight font-bold tabular-nums">
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
