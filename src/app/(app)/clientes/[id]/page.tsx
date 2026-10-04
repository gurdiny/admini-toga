import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PhoneLink } from "@/components/phone-link";
import { Badge } from "@/components/ui/badge";
import { canAdminister, canViewTotals } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { formatCode } from "@/lib/codes";
import { formatDay } from "@/lib/date";
import { formatMoney, formatMXN } from "@/lib/money";
import { getSettings, requireModule } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { EditClientButton, MergeClientButton } from "@/modules/admin/components/client-actions";
import { getClientHistory, type ClientOrder } from "@/modules/clients/queries";
import { OrderPaymentButton } from "@/modules/payments/components/order-payment-button";
import { getCaptureOptions, type CaptureOptions } from "@/modules/payments/queries";
import { NewReminderButton } from "@/modules/reminders/components/new-reminder-button";

export const metadata: Metadata = { title: "Cliente" };

/**
 * Historial completo de un cliente: sus pedidos y lo que se pagó a
 * proveedores por cada uno. Lo ve cualquiera que capture (el mostrador ve
 * cada pago, como en /pagos); las sumas y editar/fusionar, solo el dueño.
 */
export default async function ClientPage({ params }: PageProps<"/clientes/[id]">) {
  await requireModule("reminders");
  const user = await requireUser();
  const client = await getClientHistory((await params).id);
  if (!client) notFound();

  const settings = await getSettings();
  const options = settings.modules.payments ? await getCaptureOptions() : null;
  const isOwner = canAdminister(user);
  const showTotals = canViewTotals(user);
  const pending = client.orders.filter((o) => !o.isCompleted).length;
  const clientOption = { id: client.id, code: client.code, name: client.name, phone: client.phone };

  return (
    <>
      <Link
        href={isOwner ? "/admin/clientes" : "/recordatorios"}
        className="text-muted-foreground mb-1 inline-flex min-h-10 items-center gap-1 self-start text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {isOwner ? "Clientes" : "Recordatorios"}
      </Link>

      <section className="bg-card shadow-toga mb-5 space-y-3 rounded-2xl p-4">
        <div>
          <h1 className="text-2xl font-bold break-words">{client.name}</h1>
          <p className="text-muted-foreground text-sm">
            Folio {formatCode("client", client.code)} · cliente desde {client.createdAt}
          </p>
        </div>
        {client.phone ? <PhoneLink phone={client.phone} whatsApp /> : <p className="text-muted-foreground text-sm">Sin teléfono</p>}
        {client.notes && <p className="text-sm whitespace-pre-line">{client.notes}</p>}
        <dl className={cn("grid gap-2 text-center", showTotals ? "grid-cols-3" : "grid-cols-2")}>
          <Stat label="Pedidos" value={String(client.orders.length)} />
          <Stat label="Pendientes" value={String(pending)} />
          {showTotals && <Stat label="Costo" value={formatMXN(client.paidMXN)} />}
        </dl>
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <NewReminderButton client={clientOption} label="Nuevo pedido" className="h-11 w-full sm:h-10 sm:w-auto" />
          {isOwner && (
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <EditClientButton client={client} />
              <MergeClientButton client={client} />
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="historial" className="space-y-3">
        <h2 id="historial" className="font-bold">
          Historial de pedidos
        </h2>
        {client.orders.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Sin pedidos" description="Los recordatorios de este cliente aparecerán aquí con lo que se pagó a proveedores por cada uno." />
        ) : (
          <ul className="space-y-3">
            {client.orders.map((order) => (
              <OrderCard key={order.id} order={order} client={clientOption} options={options} defaultMethod={settings.defaultPaymentMethod} showTotals={showTotals} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function OrderCard({
  order,
  client,
  options,
  defaultMethod,
  showTotals,
}: {
  order: ClientOrder;
  client: { id: string; name: string };
  options: CaptureOptions | null;
  defaultMethod: CaptureOptions["defaults"]["paymentMethod"];
  showTotals: boolean;
}) {
  return (
    <li className="bg-card shadow-toga space-y-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold first-letter:uppercase">
          {formatDay(order.targetDate, "EEE d MMM yyyy")}
          {order.targetTime && ` · ${order.targetTime}`}
        </span>
        <span className="flex gap-1.5">
          {order.priority === "ALTA" && !order.isCompleted && <Badge variant="destructive">Alta</Badge>}
          <Badge
            variant="secondary"
            className={cn(order.isCompleted ? "bg-toga-green-soft text-toga-green-strong" : "bg-toga-pink-soft text-toga-pink-strong")}
          >
            {order.isCompleted ? `Completado ${order.completedAt}` : "Pendiente"}
          </Badge>
        </span>
      </div>
      <p className="text-sm break-words whitespace-pre-line">{order.note}</p>
      <p className="text-muted-foreground text-xs">Capturó {order.createdByName}</p>

      {(order.payments.length > 0 || options) && (
        <div className="bg-muted/50 space-y-2 rounded-xl p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-bold">Pagos a proveedores</h3>
            {showTotals && order.payments.length > 0 && <span className="text-sm font-bold tabular-nums">{formatMXN(order.paidMXN)}</span>}
          </div>
          {order.payments.length === 0 ? (
            <p className="text-muted-foreground text-sm">Ningún pago ligado a este pedido.</p>
          ) : (
            <ul className="divide-y">
              {order.payments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`/proveedores/${p.supplierId}`} className="-my-2 block truncate py-2 text-sm font-bold hover:underline">
                      {p.supplierName}
                    </Link>
                    <p className="truncate text-sm">{p.concept}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatCode("payment", p.code)} · {formatDay(p.date, "d MMM")} · {p.categoryName}
                    </p>
                  </div>
                  <span className="text-sm font-bold whitespace-nowrap tabular-nums">{formatMoney(p.amount, p.currency)}</span>
                </li>
              ))}
            </ul>
          )}
          {options && (
            <OrderPaymentButton
              options={options}
              defaultMethod={defaultMethod}
              order={{ id: order.id, clientId: client.id, label: `${client.name} · ${formatDay(order.targetDate, "d MMM yyyy")}` }}
            />
          )}
        </div>
      )}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/60 min-w-0 rounded-xl px-2 py-2">
      <dt className="text-muted-foreground truncate text-xs">{label}</dt>
      <dd className="truncate font-bold tabular-nums">{value}</dd>
    </div>
  );
}
