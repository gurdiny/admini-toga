import { formatCode } from "@/lib/codes";
import { formatDay, type DayKey } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CHARGE_ROWS } from "../charges";
import { DEBT_KIND_LABELS } from "../labels";
import type { DebtSummary } from "../queries";

/** Abonos que se listan en cada mitad; el resto está en el estado de cuenta. */
const MAX_ENTRIES = 4;

type Props = {
  debt: DebtSummary;
  /** Día de México, para saber si ya venció. */
  today: DayKey;
  /** Botón «Abonar» y menú ⋮ (componente de cliente). */
  actions: React.ReactNode;
};

/**
 * Una nota del proveedor, partida a la mitad como en papel: de un lado el
 * metal, del otro la mano de obra. Cada lado lleva su monto, lo abonado, lo
 * que falta y el historial de abonos de ese renglón.
 */
export function DebtNote({ debt, today, actions }: Props) {
  const overdue = debt.dueDate !== null && debt.dueDate < today;

  return (
    <li className="bg-card shadow-toga overflow-hidden rounded-2xl">
      {/* ─── Encabezado de la nota ─────────────────────────────────────── */}
      <div className="space-y-2 p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            <span className="stamp">{formatCode("debt", debt.code)}</span>
            <span>
              {DEBT_KIND_LABELS[debt.kind]} · {formatDay(debt.date, "d MMM yyyy")}
              {debt.supplierRef && ` · ${debt.supplierRef}`}
            </span>
          </p>
          {actions}
        </div>
        <div className="space-y-0.5">
          <p className="leading-snug font-bold">{debt.description}</p>
          {debt.dueDate && (
            <p className={cn("text-sm", overdue ? "text-destructive font-bold" : "text-muted-foreground")}>
              {overdue ? "Venció" : "Vence"} el {formatDay(debt.dueDate)}
            </p>
          )}
        </div>
      </div>

      {/* ─── Los dos renglones, uno de cada lado ───────────────────────── */}
      <div className="grid grid-cols-2 border-t">
        {CHARGE_ROWS.map((row, index) => {
          const total = debt.amounts[row.key];
          const paid = debt.paid[row.key];
          const left = debt.balance[row.key];
          const used = Number(total) > 0;
          const progress = used ? Math.min(100, (Number(paid) / Number(total)) * 100) : 0;
          const entries = debt.payments.filter((payment) => Number(payment[row.field]) > 0);

          return (
            <section
              key={row.key}
              className={cn("min-w-0 space-y-2 p-3", index > 0 && "border-l", !used && "bg-muted/40")}
              aria-label={`${row.label} de ${formatCode("debt", debt.code)}`}
            >
              <p className="eyebrow">{row.label}</p>

              {!used ? (
                <p className="text-muted-foreground text-sm">Esta nota no lleva {row.label.toLowerCase()}.</p>
              ) : (
                <>
                  <p className="font-heading text-lg leading-tight tabular-nums">{formatMoney(total, debt.currency)}</p>
                  <div
                    className="bg-muted h-1.5 overflow-hidden rounded-full"
                    role="progressbar"
                    aria-valuenow={Math.round(progress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${row.label}: pagado ${Math.round(progress)}%`}
                  >
                    <div className="bg-toga-green h-full" style={{ width: `${progress}%` }} />
                  </div>
                  <dl className="space-y-0.5 text-xs">
                    <div className="flex items-baseline justify-between gap-1">
                      <dt className="text-muted-foreground">Abonado</dt>
                      <dd className="tabular-nums">{formatMoney(paid, debt.currency)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-1">
                      <dt className="text-muted-foreground">Falta</dt>
                      <dd className={cn("font-bold tabular-nums", Number(left) <= 0 && "text-toga-green-strong")}>
                        {Number(left) <= 0 ? "Liquidado" : formatMoney(left, debt.currency)}
                      </dd>
                    </div>
                  </dl>

                  {/* Historial de este renglón: qué se le ha pagado aquí. */}
                  <ol className="space-y-1.5 border-t pt-2 text-xs">
                    {entries.length === 0 && <li className="text-muted-foreground">Sin abonos todavía.</li>}
                    {entries.slice(0, MAX_ENTRIES).map((payment) => (
                      <li key={payment.id} className="min-w-0">
                        <span className="flex items-baseline justify-between gap-1">
                          <span className="text-muted-foreground truncate">{formatDay(payment.date, "d MMM")}</span>
                          <span className="font-bold tabular-nums">
                            {formatMoney(payment[row.field], debt.currency)}
                          </span>
                        </span>
                        <span className="text-muted-foreground block truncate text-[0.6875rem]">
                          {formatCode("payment", payment.code)}
                        </span>
                      </li>
                    ))}
                    {entries.length > MAX_ENTRIES && (
                      <li className="text-muted-foreground">y {entries.length - MAX_ENTRIES} más abajo</li>
                    )}
                  </ol>
                </>
              )}
            </section>
          );
        })}
      </div>
    </li>
  );
}
