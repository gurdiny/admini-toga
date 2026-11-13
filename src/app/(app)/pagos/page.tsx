import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, Banknote, ChevronLeft, ChevronRight, Search, Wallet } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Monogram } from "@/components/monogram";
import { ExportMenu } from "@/components/export-menu";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canDelete, canEdit, canViewTotals } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { formatCode } from "@/lib/codes";
import { formatDay } from "@/lib/date";
import { formatMoney, formatMXN, moneyToString, toDecimal } from "@/lib/money";
import { getSettings, requireModule } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { splitLabel } from "@/modules/payments/charges";
import { BalanceText } from "@/modules/payments/components/balance-text";
import { NewOtherPaymentButton } from "@/modules/payments/components/new-other-payment-button";
import { NewPaymentButton } from "@/modules/payments/components/new-payment-button";
import { OtherPaymentRowActions } from "@/modules/payments/components/other-payment-row-actions";
import { PaymentRowActions } from "@/modules/payments/components/payment-row-actions";
import { RangePicker } from "@/modules/payments/components/range-picker";
import {
  PAYMENT_VIEW_LABELS,
  PAYMENT_VIEWS,
  parsePaymentFilters,
  paymentsHref,
  type PaymentPageFilters,
  type PaymentView,
  type SortParam,
} from "@/modules/payments/filters";
import { PAYMENT_METHOD_LABELS } from "@/modules/payments/labels";
import {
  getAllPayments,
  getCaptureOptions,
  getOtherPayments,
  getOtherPaymentsSummary,
  getPayments,
  getPaymentsSummary,
  PAGE_SIZE,
  type BreakdownRow,
  type OtherPaymentListItem,
  type OtherPaymentsSummary,
  type PaymentEntry,
  type PaymentListItem,
  type PaymentsSummary,
} from "@/modules/payments/queries";

export const metadata: Metadata = { title: "Pagos" };

const RANGE_LABEL = { hoy: "hoy", semana: "esta semana", mes: "este mes", personalizado: "el periodo" } as const;

export default async function PaymentsPage({ searchParams }: PageProps<"/pagos">) {
  await requireModule("payments");
  const user = await requireUser();
  const filters = parsePaymentFilters(await searchParams);
  const showTotals = canViewTotals(user);

  const view = filters.ver;
  const listFilters = { range: filters.range, search: filters.q, sort: filters.orden, dir: filters.dir, page: filters.pagina };

  const [{ items, total }, summary, otherSummary, options, settings] = await Promise.all([
    loadList(view, listFilters),
    showTotals && view !== "sin-proveedor" ? getPaymentsSummary(filters.range) : null,
    showTotals && view !== "proveedores" ? getOtherPaymentsSummary(filters.range) : null,
    getCaptureOptions(),
    getSettings(),
  ]);
  const newButtons = (className?: string) => (
    <>
      {view !== "sin-proveedor" && <NewPaymentButton options={options} defaultMethod={settings.defaultPaymentMethod} className={className} />}
      {view !== "proveedores" && <NewOtherPaymentButton variant={view === "todos" ? "outline" : "brand"} className={className} />}
    </>
  );
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeText =
    filters.range.from === filters.range.to
      ? formatDay(filters.range.from, "EEEE d 'de' MMMM")
      : `${formatDay(filters.range.from, "d MMM")} – ${formatDay(filters.range.to, "d MMM yyyy")}`;

  return (
    <>
      <PageHeader
        title={PAYMENT_VIEW_LABELS[view].title}
        description={<span className="first-letter:uppercase">{rangeText}</span>}
        // En celular se registra con el botón «+» de la barra inferior.
        actions={<div className="hidden gap-2 md:flex">{newButtons()}</div>}
      />

      <div className="mb-6 space-y-3">
        <ViewTabs filters={filters} />
        <RangePicker filters={filters} />
        <form className="flex gap-2" role="search">
          {view !== "proveedores" && <input type="hidden" name="ver" value={view} />}
          <input type="hidden" name="rango" value={filters.rango} />
          {filters.rango === "personalizado" && (
            <>
              <input type="hidden" name="desde" value={filters.range.from} />
              <input type="hidden" name="hasta" value={filters.range.to} />
            </>
          )}
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" aria-hidden />
            <Input
              name="q"
              type="search"
              enterKeyHint="search"
              defaultValue={filters.q}
              placeholder={SEARCH_PLACEHOLDER[view]}
              aria-label="Buscar pago"
              className="bg-card h-12 rounded-full pl-10"
            />
          </div>
          <Button type="submit" variant="outline" className="hidden h-12 sm:inline-flex">
            Buscar
          </Button>
        </form>
      </div>

      {/* ─── Totales: solo el dueño ─────────────────────────────────────── */}
      {view === "proveedores" && summary && <SupplierTotals summary={summary} rangeLabel={RANGE_LABEL[filters.rango]} />}
      {view === "sin-proveedor" && otherSummary && (
        <section aria-label="Resumen" className="mb-6">
          <div className="plate grid grid-cols-2 py-1">
            <Kpi label={`Pagado ${RANGE_LABEL[filters.rango]}`} value={formatMXN(otherSummary.totalPaid)} onPlate />
            <Kpi label="Cantidad de pagos" value={String(otherSummary.count)} onPlate divided />
          </div>
        </section>
      )}
      {view === "todos" && summary && otherSummary && (
        <CombinedTotals summary={summary} other={otherSummary} rangeLabel={RANGE_LABEL[filters.rango]} />
      )}

      {/* ─── Lista ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="lista" className="space-y-3">
        <h2 id="lista" className="sr-only">
          Lista de pagos
        </h2>
        {items.length === 0 ? (
          <EmptyState
            icon={view === "sin-proveedor" ? Banknote : Wallet}
            title={
              filters.q
                ? `Ningún pago coincide con «${filters.q}»`
                : `No hay pagos${view === "sin-proveedor" ? " sin proveedor" : ""} ${RANGE_LABEL[filters.rango]}`
            }
            description={filters.q ? "Prueba con otra palabra o cambia el periodo." : EMPTY_HINT[view]}
            action={!filters.q && <div className="flex flex-col gap-2 sm:flex-row">{newButtons()}</div>}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground text-sm">
                {total} pago{total === 1 ? "" : "s"}
                {pages > 1 && ` · página ${filters.pagina} de ${pages}`}
              </p>
              {/* Exportar es un reporte: solo el dueño. Lleva los mismos filtros, sin paginar. */}
              {showTotals && (
                <ExportMenu
                  href={paymentsHref(filters, { pagina: null }).replace(/^\/pagos/, "/api/exportar/pagos")}
                  description={`Los ${total} pago${total === 1 ? "" : "s"}${view === "sin-proveedor" ? " sin proveedor" : view === "todos" ? " (con y sin proveedor)" : ""} de ${RANGE_LABEL[filters.rango]}${filters.q ? ` que coinciden con «${filters.q}»` : ""}.`}
                />
              )}
            </div>

            {/* Celular: tarjetas */}
            <ul className="bg-card shadow-toga divide-y overflow-hidden rounded-2xl xl:hidden">
              {items.map((entry) =>
                entry.kind === "supplier" ? (
                  <SupplierCard key={entry.payment.id} p={entry.payment} actions={<Actions payment={entry.payment} user={user} options={options} defaultMethod={settings.defaultPaymentMethod} />} />
                ) : (
                  <OtherCard key={entry.payment.id} p={entry.payment} showBadge={view === "todos"} actions={<OtherActions payment={entry.payment} user={user} />} />
                ),
              )}
            </ul>

            {/* Escritorio: tabla */}
            <div className="bg-card shadow-toga hidden overflow-hidden rounded-2xl xl:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead filters={filters} sort="date" label="Fecha" />
                    {view === "sin-proveedor" ? (
                      <TableHead>Nota</TableHead>
                    ) : (
                      <>
                        {view === "proveedores" ? <SortHead filters={filters} sort="supplier" label="Proveedor" /> : <TableHead>Proveedor</TableHead>}
                        <TableHead>Concepto</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Método</TableHead>
                      </>
                    )}
                    <SortHead filters={filters} sort="amount" label="Monto" align="right" />
                    <TableHead className="w-12">
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((entry) =>
                    entry.kind === "supplier" ? (
                      <SupplierRow key={entry.payment.id} p={entry.payment} actions={<Actions payment={entry.payment} user={user} options={options} defaultMethod={settings.defaultPaymentMethod} />} />
                    ) : (
                      <OtherRow key={entry.payment.id} p={entry.payment} compact={view === "sin-proveedor"} actions={<OtherActions payment={entry.payment} user={user} />} />
                    ),
                  )}
                </TableBody>
              </Table>
            </div>

            {pages > 1 && (
              <nav className="flex items-center justify-between" aria-label="Páginas">
                <PageLink filters={filters} page={filters.pagina - 1} disabled={filters.pagina <= 1}>
                  <ChevronLeft aria-hidden /> Anterior
                </PageLink>
                <PageLink filters={filters} page={filters.pagina + 1} disabled={filters.pagina >= pages}>
                  Siguiente <ChevronRight aria-hidden />
                </PageLink>
              </nav>
            )}
          </>
        )}
      </section>
    </>
  );
}

// ─── Piezas ──────────────────────────────────────────────────────────────

const SEARCH_PLACEHOLDER: Record<PaymentView, string> = {
  proveedores: "Buscar concepto, proveedor o PAG-0001",
  "sin-proveedor": "Buscar en la nota o PSP-0001",
  todos: "Buscar concepto, nota, proveedor o folio",
};

const EMPTY_HINT: Record<PaymentView, string> = {
  proveedores: "Registra un pago de contado o un abono a lo que se le debe a un proveedor.",
  "sin-proveedor": "Aquí van los pagos que no son para un proveedor: solo cantidad, nota, día y hora.",
  todos: "Aquí se juntan los pagos a proveedores y los pagos sin proveedor.",
};

type ListFilters = Parameters<typeof getAllPayments>[0];

/** La lista de la vista elegida, siempre como entradas «supplier» u «other». */
async function loadList(view: PaymentView, filters: ListFilters): Promise<{ items: PaymentEntry[]; total: number }> {
  if (view === "todos") return getAllPayments(filters);
  if (view === "sin-proveedor") {
    const { items, total } = await getOtherPayments(filters);
    return { total, items: items.map((payment) => ({ kind: "other" as const, payment })) };
  }
  const { items, total } = await getPayments(filters);
  return { total, items: items.map((payment) => ({ kind: "supplier" as const, payment })) };
}

/** A proveedores · Sin proveedor · Todos. Conserva periodo y búsqueda. */
function ViewTabs({ filters }: { filters: PaymentPageFilters }) {
  return (
    <nav className="bg-muted grid grid-cols-3 gap-1 rounded-full p-1" aria-label="Lista de pagos">
      {PAYMENT_VIEWS.map((view) => {
        const active = filters.ver === view;
        return (
          <Button
            key={view}
            asChild
            variant="ghost"
            size="sm"
            className={cn("h-10 min-w-0 px-1 text-[13px]", active && "bg-card shadow-toga-sm hover:bg-card font-bold")}
          >
            <Link
              href={paymentsHref(filters, { ver: view === "proveedores" ? null : view, orden: null, dir: null, pagina: null })}
              aria-current={active ? "page" : undefined}
            >
              <span className="truncate">{PAYMENT_VIEW_LABELS[view].short}</span>
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

function SupplierTotals({ summary, rangeLabel }: { summary: PaymentsSummary; rangeLabel: string }) {
  return (
    <section aria-label="Resumen" className="mb-6 space-y-4">
      {/* La placa: lo pagado en el periodo y lo que se debe hoy. */}
      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="plate grid grid-cols-2 py-1">
          <Kpi label={`Pagado ${rangeLabel}`} value={formatMXN(summary.totalPaid)} onPlate />
          <Kpi label="Por pagar hoy (todos)" value={<BalanceText balances={summary.totalOwed} />} onPlate divided />
        </div>
        <div className="bg-card shadow-toga grid grid-cols-[1fr_auto] rounded-2xl">
          <Kpi
            label="Proveedor con más pagos"
            value={summary.topSupplier?.name ?? "—"}
            detail={summary.topSupplier ? formatMXN(summary.topSupplier.total) : undefined}
            small
          />
          <Kpi label="Cantidad de pagos" value={String(summary.count)} divided />
        </div>
      </div>
      {summary.count > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          <Breakdown title="Por categoría" rows={summary.byCategory} total={summary.totalPaid} />
          <Breakdown title="Por proveedor" rows={summary.bySupplier} total={summary.totalPaid} />
        </div>
      )}
    </section>
  );
}

/** «Todos»: el total junto y, abajo, cuánto fue a proveedores y cuánto sin proveedor. */
function CombinedTotals({ summary, other, rangeLabel }: { summary: PaymentsSummary; other: OtherPaymentsSummary; rangeLabel: string }) {
  const total = moneyToString(toDecimal(summary.totalPaid).add(other.totalPaid));
  // «Sin proveedor» entra como un renglón más del desglose por categoría.
  const byCategory: BreakdownRow[] = [
    ...summary.byCategory,
    ...(other.count > 0 ? [{ id: "sin-proveedor", name: "Sin proveedor", color: "var(--plata-edge)", total: other.totalPaid, count: other.count }] : []),
  ].sort((a, b) => toDecimal(b.total).comparedTo(toDecimal(a.total)));
  return (
    <section aria-label="Resumen" className="mb-6 space-y-4">
      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="plate grid grid-cols-2 py-1">
          <Kpi label={`Pagado ${rangeLabel}`} value={formatMXN(total)} onPlate />
          <Kpi label="Por pagar hoy (todos)" value={<BalanceText balances={summary.totalOwed} />} onPlate divided />
        </div>
        <div className="bg-card shadow-toga grid grid-cols-2 rounded-2xl">
          <Kpi label="A proveedores" value={formatMXN(summary.totalPaid)} detail={countText(summary.count)} small />
          <Kpi label="Sin proveedor" value={formatMXN(other.totalPaid)} detail={countText(other.count)} small divided />
        </div>
      </div>
      {summary.count + other.count > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          <Breakdown title="Por categoría" rows={byCategory} total={total} />
          {summary.count > 0 && <Breakdown title="Por proveedor" rows={summary.bySupplier} total={summary.totalPaid} />}
        </div>
      )}
    </section>
  );
}

const countText = (count: number) => `${count} pago${count === 1 ? "" : "s"}`;

function SupplierCard({ p, actions }: { p: PaymentListItem; actions: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-3 pr-1 pl-4">
      <Monogram name={p.supplierName} className="mt-0.5 size-9 text-xs" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-3">
          {/* Nombres de negocio largos: hasta dos líneas antes de cortar. */}
          {/* py-2.5: con el nombre en una sola línea, py-2 dejaba el enlace en 38 px. */}
          <Link href={`/proveedores/${p.supplierId}`} className="-my-2.5 block min-w-0 py-2.5 leading-snug font-bold">
            {/* El recorte va en el span: si fuera en el enlace, su relleno táctil dejaría asomar la tercera línea. */}
            <span className="line-clamp-2">{p.supplierName}</span>
          </Link>
          <span className="font-heading text-base whitespace-nowrap tabular-nums">{formatMoney(p.amount, p.currency)}</span>
        </div>
        <p className="line-clamp-2 text-sm">{p.concept}</p>
        <p className="text-muted-foreground text-xs">
          {formatDay(p.date, "EEE d MMM")} · {PAYMENT_METHOD_LABELS[p.paymentMethod]} · {formatCode("payment", p.code)}
        </p>
        <p className="text-muted-foreground text-xs">{splitLabel({ metal: p.amountMetal, labor: p.amountLabor }, p.currency)}</p>
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <CategoryChip name={p.categoryName} color={p.categoryColor} />
          <DebtBadge payment={p} />
        </div>
      </div>
      {actions}
    </li>
  );
}

/** Pago sin proveedor: la nota es el título; ícono de billete en vez de monograma. */
function OtherCard({ p, showBadge, actions }: { p: OtherPaymentListItem; showBadge: boolean; actions: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-3 pr-1 pl-4">
      <span className="bg-muted text-muted-foreground mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full" aria-hidden>
        <Banknote className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-3">
          <p className="line-clamp-2 min-w-0 leading-snug font-bold">{p.note}</p>
          <span className="font-heading text-base whitespace-nowrap tabular-nums">{formatMoney(p.amount, p.currency)}</span>
        </div>
        <p className="text-muted-foreground text-xs">
          {formatDay(p.date, "EEE d MMM")} · {p.time} · {formatCode("otherPayment", p.code)}
        </p>
        {showBadge && (
          <div className="pt-0.5">
            <Badge variant="outline" className="text-xs">
              Sin proveedor
            </Badge>
          </div>
        )}
      </div>
      {actions}
    </li>
  );
}

function SupplierRow({ p, actions }: { p: PaymentListItem; actions: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        {formatDay(p.date, "EEE d MMM")}
        <span className="text-muted-foreground block text-xs">{formatCode("payment", p.code)}</span>
      </TableCell>
      <TableCell className="max-w-48 truncate font-bold">
        <Link href={`/proveedores/${p.supplierId}`} className="hover:underline">
          {p.supplierName}
        </Link>
      </TableCell>
      <TableCell className="max-w-64">
        <span className="block truncate">{p.concept}</span>
        <DebtBadge payment={p} />
      </TableCell>
      <TableCell>
        <CategoryChip name={p.categoryName} color={p.categoryColor} />
      </TableCell>
      <TableCell>{PAYMENT_METHOD_LABELS[p.paymentMethod]}</TableCell>
      <TableCell className="text-right font-bold tabular-nums">
        {formatMoney(p.amount, p.currency)}
        <span className="text-muted-foreground block text-xs font-normal">{splitLabel({ metal: p.amountMetal, labor: p.amountLabor }, p.currency)}</span>
      </TableCell>
      <TableCell>{actions}</TableCell>
    </TableRow>
  );
}

/** En «Sin proveedor» la tabla solo lleva fecha, nota y monto (`compact`). */
function OtherRow({ p, compact, actions }: { p: OtherPaymentListItem; compact: boolean; actions: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        {formatDay(p.date, "EEE d MMM")} · {p.time}
        <span className="text-muted-foreground block text-xs">{formatCode("otherPayment", p.code)}</span>
      </TableCell>
      {compact ? (
        <TableCell className="max-w-xl">
          <span className="line-clamp-2">{p.note}</span>
        </TableCell>
      ) : (
        <>
          <TableCell className="text-muted-foreground italic">Sin proveedor</TableCell>
          <TableCell className="max-w-64">
            <span className="block truncate">{p.note}</span>
          </TableCell>
          <TableCell className="text-muted-foreground">—</TableCell>
          <TableCell className="text-muted-foreground">—</TableCell>
        </>
      )}
      <TableCell className="text-right font-bold tabular-nums">{formatMoney(p.amount, p.currency)}</TableCell>
      <TableCell>{actions}</TableCell>
    </TableRow>
  );
}

function OtherActions({ payment, user }: { payment: OtherPaymentListItem; user: { id: string; role: "OWNER" | "STAFF" } }) {
  return (
    <OtherPaymentRowActions
      payment={{ id: payment.id, code: payment.code, date: payment.date, time: payment.time, amount: payment.amount, note: payment.note, currency: payment.currency }}
      trace={payment.trace}
      canEdit={canEdit(user, payment)}
      canDelete={canDelete(user, payment)}
    />
  );
}

function Kpi({
  label,
  value,
  detail,
  small,
  onPlate,
  divided,
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
  small?: boolean;
  /** Grabado en la placa de plata: número grande, rótulo en mayúsculas. */
  onPlate?: boolean;
  /** Línea a la izquierda (segundo dato de la misma tarjeta). */
  divided?: boolean;
}) {
  return (
    <div className={cn("min-w-0 space-y-1 px-4 py-3", divided && (onPlate ? "plate-rule border-l" : "border-l"))}>
      <p className={cn(onPlate ? "text-plata-ink/70 text-[0.625rem] font-bold tracking-[0.1em] uppercase" : "text-muted-foreground text-xs")}>
        {label}
      </p>
      <p
        className={cn(
          "leading-tight tabular-nums",
          onPlate ? "font-heading truncate text-[clamp(1.25rem,6.2vw,1.75rem)]" : small ? "truncate text-base font-bold" : "text-xl font-bold",
        )}
      >
        {value}
      </p>
      {detail && <p className="text-muted-foreground text-sm tabular-nums">{detail}</p>}
    </div>
  );
}

function Breakdown({ title, rows, total }: { title: string; rows: BreakdownRow[]; total: string }) {
  const max = Number(rows[0]?.total ?? 0) || 1;
  return (
    // min-w-0: dentro del grid, sin esto los nombres largos estiran la tarjeta más que la pantalla.
    <div className="bg-card shadow-toga min-w-0 rounded-2xl p-4">
      <h3 className="mb-3 text-sm font-bold">{title}</h3>
      <ul className="space-y-2.5">
        {rows.slice(0, 6).map((row) => (
          <li key={row.id} className="space-y-1">
            <div className="flex justify-between gap-2 text-sm">
              <span className="truncate">{row.name}</span>
              <span className="font-bold tabular-nums">
                {formatMXN(row.total)}
                <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                  {Math.round((Number(row.total) / Number(total)) * 100)}%
                </span>
              </span>
            </div>
            <div className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden>
              <div
                className="h-full rounded-full"
                style={{ width: `${(Number(row.total) / max) * 100}%`, backgroundColor: row.color ?? "var(--toga-accent)" }}
              />
            </div>
          </li>
        ))}
      </ul>
      {rows.length > 6 && <p className="text-muted-foreground mt-2 text-xs">y {rows.length - 6} más</p>}
    </div>
  );
}

function CategoryChip({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {name}
    </span>
  );
}

function DebtBadge({ payment }: { payment: PaymentListItem }) {
  if (!payment.debtCode) {
    return (
      <Badge variant="outline" className="text-xs">
        Contado
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-toga-green-soft text-toga-green-strong text-xs">
      Abono a {formatCode("debt", payment.debtCode)}
    </Badge>
  );
}

function Actions({
  payment,
  user,
  options,
  defaultMethod,
}: {
  payment: PaymentListItem;
  user: { id: string; role: "OWNER" | "STAFF" };
  options: Awaited<ReturnType<typeof getCaptureOptions>>;
  defaultMethod: PaymentListItem["paymentMethod"];
}) {
  return (
    <PaymentRowActions
      payment={payment}
      detail={{ supplierName: payment.supplierName, categoryName: payment.categoryName, debtCode: payment.debtCode, trace: payment.trace }}
      options={options}
      defaultMethod={defaultMethod}
      canEdit={canEdit(user, payment)}
      canDelete={canDelete(user, payment)}
    />
  );
}

function SortHead({
  filters,
  sort,
  label,
  align,
}: {
  filters: PaymentPageFilters;
  sort: SortParam;
  label: string;
  align?: "right";
}) {
  const active = filters.orden === sort;
  const nextDir = active && filters.dir === "desc" ? "asc" : "desc";
  const Icon = filters.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={cn(align === "right" && "text-right")} aria-sort={active ? (filters.dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link
        href={paymentsHref(filters, { orden: sort === "date" ? null : sort, dir: nextDir === "desc" ? null : nextDir, pagina: null })}
        className={cn("inline-flex items-center gap-1 hover:underline", active && "font-bold")}
      >
        {label}
        {active && <Icon className="size-3.5" aria-hidden />}
      </Link>
    </TableHead>
  );
}

function PageLink({
  filters,
  page,
  disabled,
  children,
}: {
  filters: PaymentPageFilters;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button variant="outline" disabled className="h-10">
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" className="h-10">
      <Link href={paymentsHref(filters, { pagina: page > 1 ? page : null })}>{children}</Link>
    </Button>
  );
}
