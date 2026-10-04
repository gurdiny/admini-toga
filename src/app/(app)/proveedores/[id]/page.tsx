import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Receipt } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PhoneLink } from "@/components/phone-link";
import { Badge } from "@/components/ui/badge";
import { canAdminister, canDelete, canEdit } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { formatCode } from "@/lib/codes";
import { formatDay, getToday } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { getSettings, requireModule } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { BalanceText } from "@/modules/payments/components/balance-text";
import { DebtCardActions } from "@/modules/payments/components/debt-card-actions";
import { PaymentRowActions } from "@/modules/payments/components/payment-row-actions";
import { SupplierHeaderActions } from "@/modules/payments/components/supplier-header-actions";
import { DEBT_KIND_LABELS, PAYMENT_METHOD_LABELS } from "@/modules/payments/labels";
import {
  getCaptureOptions,
  getSupplier,
  getSupplierBalances,
  getSupplierDebts,
  getSupplierStatement,
} from "@/modules/payments/queries";

export async function generateMetadata({ params }: PageProps<"/proveedores/[id]">): Promise<Metadata> {
  const supplier = await getSupplier((await params).id);
  return { title: supplier?.name ?? "Proveedor" };
}

export default async function SupplierPage({ params }: PageProps<"/proveedores/[id]">) {
  await requireModule("payments");
  const user = await requireUser();
  const { id } = await params;
  const supplier = await getSupplier(id);
  if (!supplier) notFound();

  const [debts, statement, balances, options, settings] = await Promise.all([
    getSupplierDebts(id),
    getSupplierStatement(id),
    getSupplierBalances([id]),
    getCaptureOptions(),
    getSettings(),
  ]);
  const openDebts = debts.filter((d) => !d.isSettled);
  const today = getToday();
  const defaultMethod = settings.defaultPaymentMethod;

  return (
    <>
      <Link href="/proveedores" className="text-muted-foreground mb-1 inline-flex min-h-10 items-center gap-1 text-sm">
        <ArrowLeft className="size-4" aria-hidden />
        Proveedores
      </Link>

      {/* ─── Encabezado ─────────────────────────────────────────────────── */}
      <section className="mb-6 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{supplier.name}</h1>
            <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
              {formatCode("supplier", supplier.code)}
              {supplier.category && <Badge variant="secondary">{supplier.category.name}</Badge>}
              {!supplier.isActive && <Badge variant="destructive">Desactivado</Badge>}
            </p>
          </div>
          <SupplierHeaderActions
            supplier={{ ...supplier, categoryId: supplier.category?.id ?? null }}
            options={options}
            defaultMethod={defaultMethod}
            canToggleActive={canAdminister(user)}
          />
        </div>

        <dl className="text-sm sm:flex sm:flex-wrap sm:gap-x-6 sm:gap-y-1">
          {supplier.contactName && (
            <div className="flex gap-1">
              <dt className="text-muted-foreground">Contacto:</dt>
              <dd>{supplier.contactName}</dd>
            </div>
          )}
          {supplier.phone ? (
            <div className="flex gap-1">
              <dt className="sr-only">Teléfono</dt>
              <dd>
                <PhoneLink phone={supplier.phone} whatsApp={supplier.hasWhatsApp} />
              </dd>
            </div>
          ) : (
            <div className="text-muted-foreground">Sin teléfono</div>
          )}
          {supplier.email && (
            <div className="flex gap-1">
              <dt className="text-muted-foreground">Correo:</dt>
              <dd>
                <a href={`mailto:${supplier.email}`} className="underline underline-offset-4">
                  {supplier.email}
                </a>
              </dd>
            </div>
          )}
          {supplier.address && (
            <div className="flex gap-1">
              <dt className="text-muted-foreground">Dirección:</dt>
              <dd>{supplier.address}</dd>
            </div>
          )}
        </dl>
        {supplier.notes && <p className="text-muted-foreground text-sm whitespace-pre-line">{supplier.notes}</p>}
      </section>

      {/* ─── Saldo ──────────────────────────────────────────────────────── */}
      <section className="bg-card shadow-toga mb-6 rounded-2xl p-5" aria-labelledby="saldo">
        <p id="saldo" className="text-muted-foreground text-sm">
          Le debes hoy
        </p>
        <BalanceText balances={balances.get(id) ?? {}} className="text-3xl" />
        <p className="text-muted-foreground mt-1 text-sm">
          {openDebts.length === 0
            ? "Sin adeudos abiertos."
            : `${openDebts.length} adeudo${openDebts.length > 1 ? "s" : ""} abierto${openDebts.length > 1 ? "s" : ""}.`}
        </p>
      </section>

      {/* ─── Adeudos abiertos ───────────────────────────────────────────── */}
      {openDebts.length > 0 && (
        <section className="mb-8 space-y-3" aria-labelledby="adeudos">
          <h2 id="adeudos" className="text-lg font-bold">
            Adeudos abiertos
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {openDebts.map((debt) => {
              const progress = Math.min(100, (Number(debt.paid) / Number(debt.amount)) * 100);
              const overdue = debt.dueDate !== null && debt.dueDate < today;
              return (
                <li key={debt.id} className="bg-card shadow-toga space-y-3 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-muted-foreground text-xs">
                        {formatCode("debt", debt.code)} · {DEBT_KIND_LABELS[debt.kind]} · {formatDay(debt.date)}
                        {debt.supplierRef && ` · ${debt.supplierRef}`}
                      </p>
                      <p className="font-bold">{debt.description}</p>
                      {debt.dueDate && (
                        <p className={cn("text-sm", overdue ? "text-destructive font-bold" : "text-muted-foreground")}>
                          {overdue ? "Venció" : "Vence"} el {formatDay(debt.dueDate)}
                        </p>
                      )}
                    </div>
                    <DebtCardActions
                      debt={debt}
                      supplierId={id}
                      supplierName={supplier.name}
                      options={options}
                      defaultMethod={defaultMethod}
                      canEdit={canEdit(user, debt)}
                      canDelete={canDelete(user, debt)}
                    />
                  </div>
                  <div
                    className="bg-muted h-2 overflow-hidden rounded-full"
                    role="progressbar"
                    aria-valuenow={Math.round(progress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Pagado ${Math.round(progress)}%`}
                  >
                    <div className="bg-toga-green h-full" style={{ width: `${progress}%` }} />
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground text-xs">Total</dt>
                      <dd className="tabular-nums">{formatMoney(debt.amount, debt.currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">Abonado</dt>
                      <dd className="tabular-nums">{formatMoney(debt.paid, debt.currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">Saldo</dt>
                      <dd className="font-bold tabular-nums">{formatMoney(debt.balance, debt.currency)}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ─── Estado de cuenta ───────────────────────────────────────────── */}
      <section className="space-y-3" aria-labelledby="movimientos">
        <h2 id="movimientos" className="text-lg font-bold">
          Estado de cuenta
        </h2>
        {statement.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Sin movimientos"
            description="Registra un adeudo cuando te entregue algo a crédito, o un pago de contado."
          />
        ) : (
          <ol className="bg-card shadow-toga divide-y overflow-hidden rounded-2xl">
            {[...statement].reverse().map((entry) => {
              const isDebt = entry.type === "DEBT";
              const code = formatCode(isDebt ? "debt" : "payment", entry.code);
              return (
                <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-muted-foreground text-xs">
                      {formatDay(entry.date)} · {code}
                      {entry.type === "ABONO" && entry.debtCode && ` → ${formatCode("debt", entry.debtCode)}`}
                      {entry.paymentMethod && ` · ${PAYMENT_METHOD_LABELS[entry.paymentMethod]}`}
                    </p>
                    <p className="truncate">
                      {entry.type === "CONTADO" && <Badge variant="outline" className="mr-1.5">Contado</Badge>}
                      {entry.description}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn("font-bold tabular-nums", isDebt ? "text-destructive" : entry.type === "ABONO" && "text-toga-green-strong")}>
                      {isDebt ? "+" : entry.type === "ABONO" ? "−" : ""}
                      {formatMoney(entry.amount.replace("-", ""), entry.currency)}
                    </p>
                    {entry.type !== "CONTADO" && (
                      <p className="text-muted-foreground text-xs tabular-nums">
                        Saldo {formatMoney(entry.balanceAfter, entry.currency)}
                      </p>
                    )}
                  </div>
                  {entry.payment && (
                    <PaymentRowActions
                      payment={{ ...entry.payment, code: entry.code }}
                      detail={{ supplierName: supplier.name, categoryName: entry.categoryName ?? "", debtCode: entry.debtCode, trace: entry.trace! }}
                      options={options}
                      defaultMethod={defaultMethod}
                      canEdit={canEdit(user, entry)}
                      canDelete={canDelete(user, entry)}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}
