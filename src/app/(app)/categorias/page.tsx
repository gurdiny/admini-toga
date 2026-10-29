import type { Metadata } from "next";
import { Tags } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { requireModule } from "@/lib/settings";
import { AdminTable } from "@/modules/admin/components/admin-table";
import { CategoryRowActions, NewCategoryButton } from "@/modules/admin/components/catalog-actions";
import { categoryColumns } from "@/modules/admin/components/category-columns";
import { listCategories } from "@/modules/admin/queries";

export const metadata: Metadata = { title: "Categorías" };

// Categorías de pago para los dos usuarios (decisión de Gera): agregar,
// editar, ordenar y quitar (desactivar). Nunca se borran: lo que ya las usa
// las conserva. Los tipos de proveedor siguen en /admin/catalogos.
export default async function CategoriesPage() {
  await requireModule("payments");
  await requireUser();
  const rows = await listCategories("PAYMENT");

  return (
    <>
      <PageHeader
        title="Categorías"
        description="Las que eliges al registrar un pago. Para quitar una, desactívala: deja de salir al capturar y los pagos que ya la usan la conservan."
        actions={<NewCategoryButton type="PAYMENT" />}
      />
      <AdminTable
        label="Categorías de pago"
        rows={rows}
        rowKey={(c) => c.id}
        columns={categoryColumns}
        muted={(c) => !c.isActive}
        actions={(c) => <CategoryRowActions type="PAYMENT" category={c} isFirst={c.id === rows[0].id} isLast={c.id === rows.at(-1)!.id} />}
        empty={{ icon: Tags, title: "Sin categorías", description: "Crea la primera con «Nueva categoría»." }}
      />
    </>
  );
}
