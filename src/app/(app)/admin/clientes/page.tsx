import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { formatPhone } from "@/components/phone-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCode } from "@/lib/codes";
import { formatDay } from "@/lib/date";
import { formatMXN } from "@/lib/money";
import { AdminTable, type AdminColumn } from "@/modules/admin/components/admin-table";
import { listClients, type ClientRow } from "@/modules/admin/queries";

export const metadata: Metadata = { title: "Clientes" };

const columns: AdminColumn<ClientRow>[] = [
  {
    header: "Cliente",
    mobile: "title",
    cell: (c) => (
      <Link href={`/clientes/${c.id}`} className="-my-2 block py-2 hover:underline">
        {c.name}
      </Link>
    ),
  },
  { header: "Folio y teléfono", cell: (c) => [formatCode("client", c.code), c.phone && formatPhone(c.phone)].filter(Boolean).join(" · ") },
  {
    header: "Pedidos",
    cell: (c) =>
      c.orders === 0
        ? "Sin pedidos"
        : `${c.orders} pedido${c.orders === 1 ? "" : "s"}${c.pending ? ` · ${c.pending} pendiente${c.pending === 1 ? "" : "s"}` : ""}${c.lastOrder ? ` · último ${formatDay(c.lastOrder, "d MMM")}` : ""}`,
  },
  { header: "Pagado asociado", align: "right", mobile: "hidden", cell: (c) => <span className="tabular-nums">{formatMXN(c.totalPaid)}</span> },
];

export default async function ClientsPage({ searchParams }: PageProps<"/admin/clientes">) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const rows = await listClients(q);

  return (
    <>
      <PageHeader title="Clientes" description="Historial de pedidos y fusión de clientes capturados dos veces." />
      <form className="mb-4 flex gap-2" role="search">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" aria-hidden />
          <Input
            name="q"
            type="search"
            enterKeyHint="search"
            defaultValue={q}
            placeholder="Nombre, folio o teléfono"
            aria-label="Buscar cliente"
            className="bg-card h-12 rounded-full pl-10"
          />
        </div>
        <Button type="submit" variant="outline" className="hidden h-12 sm:inline-flex">
          Buscar
        </Button>
      </form>
      <AdminTable
        label="Clientes"
        rows={rows}
        rowKey={(c) => c.id}
        columns={columns}
        actions={(c) => (
          <Button asChild variant="ghost" size="icon" aria-label={`Ver ${c.name}`}>
            <Link href={`/clientes/${c.id}`}>
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        )}
        empty={{
          icon: Users,
          title: q ? `Ningún cliente coincide con «${q}»` : "Aún no hay clientes",
          description: q ? "Prueba con el folio (CLI-0003) o el teléfono." : "Se dan de alta al capturar un recordatorio.",
        }}
      />
    </>
  );
}
