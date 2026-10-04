import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, Wallet } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canDelete, canEdit, canViewTotals } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { formatCode } from "@/lib/codes";
import { formatDay } from "@/lib/date";
import { formatMoney, formatMXN } from "@/lib/money";
import { getSettings, requireModule } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { BalanceText } from "@/modules/payments/components/balance-text";
import { NewPaymentButton } from "@/modules/payments/components/new-payment-button";
import { PaymentRowActions } from "@/modules/payments/components/payment-row-actions";
import { RangePicker } from "@/modules/payments/components/range-picker";
import { parsePaymentFilters, paymentsHref, type PaymentPageFilters, type SortParam } from "@/modules/payments/filters";
import { PAYMENT_METHOD_LABELS } from "@/modules/payments/labels";
import {
  getCaptureOptions,
  getPayments,
  getPaymentsSummary,
  PAGE_SIZE,
  type BreakdownRow,
  type PaymentListItem,
} from "@/modules/payments/queries";

export const metadata: Metadata = { title: "Pagos" };

const RANGE_LABEL = { hoy: "hoy", semana: "esta semana", mes: "este mes", personalizado: "el periodo" } as const;

export default async function PaymentsPage({ searchParams }: PageProps<"/pagos">) {
  await requireModule("payments");
  const user = await requireUser();
  const filters = parsePaymentFilters(await searchParams);
  const showTotals = canViewTotals(user);

  const [{ items, total }, summary, options, settings] = await Promise.all([
    getPayments({ range: filters.range, search: filters.q, sort: filters.orden, dir: filters.dir, page: filters.pagina }),
    showTotals ? getPaymentsSummary(filters.range) : null,
    getCaptureOptions(),
    getSettings(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeText =
    filters.range.from === filters.range.to
      ? formatDay(filters.range.from, "EEEE d 'de' MMMM")
      : `${formatDay(filters.range.from, "d MMM")} – ${formatDay(filters.range.to, "d MMM yyyy")}`;

  return (
    <>
      <PageHeader
        title="Pagos a proveedores"
        description={<span className="first-letter:uppercase">{rangeText}</span>}
        // En celular se registra con el botón «+» de la barra inferior.
        actions={<NewPaymentButton options={options} defaultMethod={settings.defaultPaymentMethod} className="hidden md:inline-flex" />}
      />

      <div className="mb-6 space-y-3">
        <RangePicker filters={filters} />
        <form className="flex gap-2" role="search">
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
              placeholder="Buscar concepto, proveedor o PAG-0001"
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
      {summary && (
        <section aria-label="Resumen" className="mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={`Pagado ${RANGE_LABEL[filters.rango]}`} value={formatMXN(summary.totalPaid)} />
            <Kpi label="Por pagar hoy (todos)" value={<BalanceText balances={summary.totalOwed} />} tone="owed" />
            <Kpi
              label="Proveedor con más pagos"
              value={summary.topSupplier?.name ?? "—"}
              detail={summary.topSupplier ? formatMXN(summary.topSupplier.total) : undefined}
              small
            />
            <Kpi label="Cantidad de pagos" value={String(summary.count)} />
          </div>
          {summary.count > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              <Breakdown title="Por categoría" rows={summary.byCategory} total={summary.totalPaid} />
              <Breakdown title="Por proveedor" rows={summary.bySupplier} total={summary.totalPaid} />
            </div>
          )}
        </section>
      )}

      {/* ─── Lista ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="lista" className="space-y-3">
        <h2 id="lista" className="sr-only">
          Lista de pagos
        </h2>
        {items.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={filters.q ? `Ningún pago coincide con «${filters.q}»` : `No hay pagos ${RANGE_LABEL[filters.rango]}`}
            description={
              filters.q
                ? "Prueba con otra palabra o cambia el periodo."
                : "Registra un pago de contado o un abono a lo que se le debe a un proveedor."
            }
            action={!filters.q && <NewPaymentButton options={options} defaultMethod={settings.defaultPaymentMethod} />}
          />
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              {total} pago{total === 1 ? "" : "s"}
              {pages > 1 && ` · página ${filters.pagina} de ${pages}`}
            </p>

            {/* Celular: tarjetas */}
            <ul className="bg-card shadow-toga divide-y overflow-hidden rounded-2xl xl:hidden">
              {items.map((p) => (
                <li key={p.id} className="flex items-start gap-2 py-3 pr-1 pl-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link href={`/proveedores/${p.supplierId}`} className="-my-2 truncate py-2 font-bold">
                        {p.supplierName}
                      </Link>
                      <span className="text-base font-bold whitespace-nowrap tabular-nums">{formatMoney(p.amount, p.currency)}</span>
                    </div>
                    <p className="truncate text-sm">{p.concept}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatDay(p.date, "EEE d MMM")} · {PAYMENT_METHOD_LABELS[p.paymentMethod]} · {formatCode("payment", p.code)}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <CategoryChip name={p.categoryName} color={p.categoryColor} />
                      <DebtBadge payment={p} />
                    </div>
                  </div>
                  <Actions payment={p} user={user} options={options} defaultMethod={settings.defaultPaymentMethod} />
                </li>
              ))}
            </ul>

            {/* Escritorio: tabla */}
            <div className="bg-card shadow-toga hidden overflow-hidden rounded-2xl xl:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead filters={filters} sort="date" label="Fecha" />
                    <SortHead filters={filters} sort="supplier" label="Proveedor" />
                    <TableHead>Concepto</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Método</TableHead>
                    <SortHead filters={filters} sort="amount" label="Monto" align="right" />
                    <TableHead className="w-12">
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((p) => (
                    <TableRow key={p.id}>
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
                      <TableCell className="text-right font-bold tabular-nums">{formatMoney(p.amount, p.currency)}</TableCell>
                      <TableCell>
                        <Actions payment={p} user={user} options={options} defaultMethod={settings.defaultPaymentMethod} />
                      </TableCell>
                    </TableRow>
                  ))}
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

function Kpi({
  label,
  value,
  detail,
  tone,
  small,
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
  tone?: "owed";
  small?: boolean;
}) {
  return (
    <div className={cn("bg-card shadow-toga space-y-1 rounded-2xl p-4", tone === "owed" && "ring-destructive/25 ring-1")}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn("leading-tight font-bold tabular-nums", small ? "truncate text-base" : "text-xl")}>{value}</p>
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
