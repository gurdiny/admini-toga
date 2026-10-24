import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Receipt } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Monogram } from "@/components/monogram";
import { PhoneLink } from "@/components/phone-link";
import { Badge } from "@/components/ui/badge";
import { canAdminister, canDelete, canEdit } from "@/lib/auth/permissions";
import { splitsByCurrency } from "@/modules/payments/aggregate";
import { CHARGE_ROWS, chargesLabel, splitLabel } from "@/modules/payments/charges";
import { requireUser } from "@/lib/auth/session";
import { formatCode } from "@/lib/codes";
import { formatDay, getToday } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { getSettings, requireModule } from "@/lib/settings";
import { plural } from "@/lib/text";
import { cn } from "@/lib/utils";
import { BalanceText } from "@/modules/payments/components/balance-text";
import { DebtCardActions } from "@/modules/payments/components/debt-card-actions";
import { DebtNote } from "@/modules/payments/components/debt-note";
import { PaymentRowActions } from "@/modules/payments/components/payment-row-actions";
import { SupplierHeaderActions } from "@/modules/payments/components/supplier-header-actions";
import { PAYMENT_METHOD_LABELS } from "@/modules/payments/labels";
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
  // Lo que le debes, partido en metal y hechura (una entrada por moneda).
  const owedByRow = splitsByCurrency(debts.map((debt) => ({ currency: debt.currency, balance: debt.balance })));
  const today = getToday();
  const defaultMethod = settings.defaultPaymentMethod;

  return (
    <>
      <Link href="/proveedores" className="text-muted-foreground mb-1 inline-flex min-h-10 items-center gap-1 text-sm">
        <ArrowLeft className="size-4" aria-hidden />
        Proveedores
      </Link>

      {/* ─── Encabezado: quién es ──────────────────────────────────────── */}
      <section className="mb-4 flex items-center gap-3">
        <Monogram name={supplier.name} className="size-12 text-base" />
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-[1.625rem] leading-tight font-bold tracking-tight">{supplier.name}</h1>
          <p className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="stamp">{formatCode("supplier", supplier.code)}</span>
            <Badge variant="secondary">{chargesLabel(supplier)}</Badge>
            {!supplier.isActive && <Badge variant="destructive">Desactivado</Badge>}
          </p>
        </div>
      </section>

      {/* ─── Saldo: la placa de plata ───────────────────────────────────── */}
      <section className="plate mb-4 p-5" aria-labelledby="saldo">
        <span className="hallmark-925 absolute top-4 right-4" aria-hidden>
          925
        </span>
        <p id="saldo" className="text-[0.6875rem] font-bold tracking-[0.12em] text-plata-ink/70 uppercase">
          Le debes hoy
        </p>
        <BalanceText balances={balances.get(id) ?? {}} className="font-heading mt-1 block text-[2.25rem] leading-tight" />
        <p className="text-plata-ink/70 mt-1 text-sm">
          {openDebts.length === 0
            ? "Sin adeudos abiertos."
            : `${plural(openDebts.length, "adeudo abierto", "adeudos abiertos")}.`}
        </p>
        {/* De lo que debe, cuánto es metal y cuánto hechura. */}
        {Object.entries(owedByRow).map(([currency, split]) => (
          <dl key={currency} className="plate-rule mt-3 grid grid-cols-2 gap-3 border-t pt-3">
            {CHARGE_ROWS.map((row, index) => (
              <div key={row.key} className={cn("min-w-0", index > 0 && "plate-rule border-l pl-3")}>
                <dt className="text-[0.6875rem] font-bold tracking-[0.12em] text-plata-ink/70 uppercase">{row.label}</dt>
                <dd className="font-heading truncate text-lg tabular-nums">{formatMoney(split[row.key], currency)}</dd>
              </div>
            ))}
          </dl>
        ))}
      </section>

      {/* ─── Qué hacer y cómo contactarlo ──────────────────────────────── */}
      <section className="mb-7 space-y-3">
        <SupplierHeaderActions
          supplier={supplier}
          options={options}
          defaultMethod={defaultMethod}
          canToggleActive={canAdminister(user)}
          counts={{ debts: debts.length, payments: statement.filter((entry) => entry.payment).length }}
        />
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

      {/* ─── Adeudos abiertos ───────────────────────────────────────────── */}
      {openDebts.length > 0 && (
        <section className="mb-8 space-y-3" aria-labelledby="adeudos">
          <h2 id="adeudos" className="text-lg font-bold">
            Adeudos abiertos
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {openDebts.map((debt) => (
              <DebtNote
                key={debt.id}
                debt={debt}
                today={today}
                actions={
                  <DebtCardActions
                    debt={debt}
                    supplierId={id}
                    supplierName={supplier.name}
                    options={options}
                    defaultMethod={defaultMethod}
                    canEdit={canEdit(user, debt)}
                    canDelete={canDelete(user, debt)}
                  />
                }
              />
            ))}
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
                  {/* Primero qué fue (el concepto); debajo, los datos de referencia. */}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="line-clamp-2 leading-snug">
                      {entry.type === "CONTADO" && <Badge variant="outline" className="mr-1.5">Contado</Badge>}
                      {entry.description}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatDay(entry.date, "d MMM yyyy")} · {code}
                      {entry.type === "ABONO" && entry.debtCode && ` → ${formatCode("debt", entry.debtCode)}`}
                      {entry.paymentMethod && ` · ${PAYMENT_METHOD_LABELS[entry.paymentMethod]}`}
                    </p>
                    <p className="text-muted-foreground text-xs">{splitLabel(entry.split, entry.currency)}</p>
                  </div>
                  <div className="shrink-0 text-right">
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
