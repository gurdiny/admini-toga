import type { Metadata } from "next";
import Link from "next/link";
import { Tags, Truck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { formatCode } from "@/lib/codes";
import { cn } from "@/lib/utils";
import { AdminTable, type AdminColumn } from "@/modules/admin/components/admin-table";
import { CategoryRowActions, NewCategoryButton, SupplierActiveButton } from "@/modules/admin/components/catalog-actions";
import { listCategories, type CategoryRow } from "@/modules/admin/queries";
import { listSuppliers, type SupplierListItem } from "@/modules/payments/queries";

export const metadata: Metadata = { title: "Catálogos" };

const TABS = [
  { value: "pago", label: "Categorías de pago" },
  { value: "proveedor", label: "Tipos de proveedor" },
  { value: "proveedores", label: "Proveedores" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const categoryColumns: AdminColumn<CategoryRow>[] = [
  {
    header: "Categoría",
    mobile: "title",
    cell: (c) => (
      <span className="inline-flex items-center gap-2">
        <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
        {c.name}
        {!c.isActive && <Badge variant="outline">Desactivada</Badge>}
      </span>
    ),
  },
  { header: "En uso", cell: (c) => (c.usage ? `${c.usage} registro${c.usage === 1 ? "" : "s"}` : "Sin usar") },
];

const supplierColumns: AdminColumn<SupplierListItem>[] = [
  {
    header: "Proveedor",
    mobile: "title",
    cell: (s) => (
      <span className="inline-flex flex-wrap items-center gap-2">
        {s.name}
        {!s.isActive && <Badge variant="outline">Desactivado</Badge>}
      </span>
    ),
  },
  { header: "Código", cell: (s) => [formatCode("supplier", s.code), s.categoryName].filter(Boolean).join(" · ") },
];

export default async function CatalogsPage({ searchParams }: PageProps<"/admin/catalogos">) {
  const raw = (await searchParams).tab;
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : "pago";
  const type = tab === "proveedor" ? "SUPPLIER" : "PAYMENT";

  return (
    <>
      <PageHeader
        title="Catálogos"
        description="Lo desactivado deja de aparecer al capturar; lo que ya lo usa lo conserva. Nada se borra."
        actions={tab !== "proveedores" && <NewCategoryButton type={type} />}
      />
      <nav className="bg-muted mb-4 grid grid-cols-3 gap-1 rounded-2xl p-1" aria-label="Catálogo">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "pago" ? "/admin/catalogos" : `/admin/catalogos?tab=${t.value}`}
            aria-current={tab === t.value ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-xl px-1 text-center text-[13px] leading-tight",
              tab === t.value ? "bg-card shadow-toga-sm font-bold" : "text-muted-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "proveedores" ? <SuppliersTab /> : <CategoriesTab type={type} />}
    </>
  );
}

async function CategoriesTab({ type }: { type: "PAYMENT" | "SUPPLIER" }) {
  const rows = await listCategories(type);
  return (
    <AdminTable
      label="Categorías"
      rows={rows}
      rowKey={(c) => c.id}
      columns={categoryColumns}
      muted={(c) => !c.isActive}
      actions={(c) => <CategoryRowActions type={type} category={c} isFirst={c.id === rows[0].id} isLast={c.id === rows.at(-1)!.id} />}
      empty={{ icon: Tags, title: "Sin categorías", description: "Crea la primera con «Nueva categoría»." }}
    />
  );
}

async function SuppliersTab() {
  const rows = await listSuppliers({ includeInactive: true });
  return (
    <>
      <p className="text-muted-foreground mb-3 text-sm">
        Los datos de cada proveedor se editan en <Link href="/proveedores" className="underline underline-offset-4">Proveedores</Link>; aquí
        solo se activan o desactivan.
      </p>
      <AdminTable
        label="Proveedores"
        rows={rows}
        rowKey={(s) => s.id}
        columns={supplierColumns}
        muted={(s) => !s.isActive}
        actions={(s) => <SupplierActiveButton supplier={s} />}
        empty={{ icon: Truck, title: "Sin proveedores" }}
      />
    </>
  );
}
