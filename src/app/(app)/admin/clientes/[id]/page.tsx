import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PhoneLink } from "@/components/phone-link";
import { Badge } from "@/components/ui/badge";
import { formatCode } from "@/lib/codes";
import { formatDay } from "@/lib/date";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { EditClientButton, MergeClientButton } from "@/modules/admin/components/client-actions";
import { getClientDetail } from "@/modules/admin/queries";

export const metadata: Metadata = { title: "Cliente" };

export default async function ClientPage({ params }: PageProps<"/admin/clientes/[id]">) {
  const client = await getClientDetail((await params).id);
  if (!client) notFound();
  const pending = client.orders.filter((o) => !o.isCompleted).length;

  return (
    <>
      <Link href="/admin/clientes" className="text-muted-foreground mb-1 inline-flex min-h-10 items-center gap-1 text-sm">
        <ArrowLeft className="size-4" aria-hidden />
        Clientes
      </Link>

      <section className="bg-card shadow-toga mb-5 space-y-3 rounded-2xl p-4">
        <div>
          <h1 className="text-2xl font-bold">{client.name}</h1>
          <p className="text-muted-foreground text-sm">
            Folio {formatCode("client", client.code)} · cliente desde {client.createdAt}
          </p>
        </div>
        {client.phone ? <PhoneLink phone={client.phone} whatsApp /> : <p className="text-muted-foreground text-sm">Sin teléfono</p>}
        {client.notes && <p className="text-sm whitespace-pre-line">{client.notes}</p>}
        <dl className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Pedidos" value={String(client.orders.length)} />
          <Stat label="Pendientes" value={String(pending)} />
          <Stat label="Pagado asociado" value={formatMXN(client.totalPaid)} />
        </dl>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <EditClientButton client={client} />
          <MergeClientButton client={client} />
        </div>
      </section>

      <section aria-labelledby="historial" className="space-y-3">
        <h2 id="historial" className="font-bold">
          Historial de pedidos
        </h2>
        {client.orders.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Sin pedidos" description="Los recordatorios de este cliente aparecerán aquí." />
        ) : (
          <ul className="bg-card shadow-toga divide-y overflow-hidden rounded-2xl">
            {client.orders.map((o) => (
              <li key={o.id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-bold first-letter:uppercase">
                    {formatDay(o.targetDate, "EEE d MMM yyyy")}
                    {o.targetTime && ` · ${o.targetTime}`}
                  </span>
                  <span className="flex gap-1.5">
                    {o.priority === "ALTA" && !o.isCompleted && <Badge variant="destructive">Alta</Badge>}
                    <Badge
                      variant="secondary"
                      className={cn(o.isCompleted ? "bg-toga-green-soft text-toga-green-strong" : "bg-toga-pink-soft text-toga-pink-strong")}
                    >
                      {o.isCompleted ? `Completado ${o.completedAt}` : "Pendiente"}
                    </Badge>
                  </span>
                </div>
                <p className="text-sm whitespace-pre-line">{o.note}</p>
                <p className="text-muted-foreground text-xs">Capturó {o.createdByName}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/60 rounded-xl px-2 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate font-bold tabular-nums">{value}</dd>
    </div>
  );
}
