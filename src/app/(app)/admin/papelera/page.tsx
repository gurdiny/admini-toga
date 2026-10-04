import type { Metadata } from "next";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { AdminTable, type AdminColumn } from "@/modules/admin/components/admin-table";
import { RestoreButton } from "@/modules/admin/components/restore-button";
import { listTrash, TRASH_TYPES, type TrashRow, type TrashType } from "@/modules/admin/queries";

export const metadata: Metadata = { title: "Papelera" };

const FILTERS: { value: TrashType | null; label: string }[] = [
  { value: null, label: "Todo" },
  { value: "pagos", label: "Pagos" },
  { value: "adeudos", label: "Adeudos" },
  { value: "recordatorios", label: "Recordatorios" },
];

const columns: AdminColumn<TrashRow>[] = [
  { header: "Registro", mobile: "title", cell: (r) => r.title },
  { header: "Detalle", cell: (r) => <span className="line-clamp-2">{r.detail}</span> },
  { header: "Monto", align: "right", cell: (r) => (r.amount ? <span className="tabular-nums">{r.amount}</span> : null) },
  { header: "Borrado", cell: (r) => `Borrado ${r.deletedAt}${r.deletedBy ? ` por ${r.deletedBy}` : ""}` },
];

export default async function TrashPage({ searchParams }: PageProps<"/admin/papelera">) {
  const raw = (await searchParams).tipo;
  const type = typeof raw === "string" && raw in TRASH_TYPES ? (raw as TrashType) : undefined;
  const rows = await listTrash(type);

  return (
    <>
      <PageHeader title="Papelera" description="Nada se borra de verdad: aquí está lo borrado, y se puede restaurar." />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filtrar papelera">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={f.value ? `/admin/papelera?tipo=${f.value}` : "/admin/papelera"}
            aria-current={(type ?? null) === f.value ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center rounded-full px-4 text-sm",
              (type ?? null) === f.value ? "bg-card shadow-toga-sm font-bold" : "text-muted-foreground bg-muted",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <AdminTable
        label="Registros borrados"
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        actions={(r) => <RestoreButton type={r.type} id={r.id} title={r.title} />}
        empty={{ icon: Trash2, title: "La papelera está vacía", description: "Cuando alguien borre un pago, adeudo o recordatorio, aparecerá aquí." }}
      />
    </>
  );
}
