import { Badge } from "@/components/ui/badge";
import type { CategoryRow } from "../queries";
import type { AdminColumn } from "./admin-table";

/** Columnas de la lista de categorías: /admin/catalogos y /categorias. */
export const categoryColumns: AdminColumn<CategoryRow>[] = [
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
