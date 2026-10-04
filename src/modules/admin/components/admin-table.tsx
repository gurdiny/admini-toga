import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type AdminColumn<T> = {
  header: string;
  cell: (row: T) => React.ReactNode;
  /**
   * En celular: "title" va en negritas arriba, "detail" en una línea gris
   * debajo, "hidden" no se muestra (solo en la tabla de escritorio).
   */
  mobile?: "title" | "detail" | "hidden";
  align?: "right";
  className?: string;
};

type Props<T> = {
  rows: T[];
  rowKey: (row: T) => string;
  columns: AdminColumn<T>[];
  /** Botones o menú de cada fila (componentes cliente con sus permisos ya resueltos). */
  actions?: (row: T) => React.ReactNode;
  /** Fila atenuada, p. ej. un registro desactivado. */
  muted?: (row: T) => boolean;
  empty: { icon: LucideIcon; title: string; description?: string };
  label: string;
};

/**
 * Tabla de /admin configurada por columnas y acciones: en celular son
 * tarjetas, desde md una tabla. Agregar una sección nueva = definir columnas.
 * Componente de servidor: las columnas son funciones y no cruzan al cliente.
 */
export function AdminTable<T>({ rows, rowKey, columns, actions, muted, empty, label }: Props<T>) {
  if (rows.length === 0) return <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />;

  const title = columns.filter((c) => c.mobile === "title");
  const details = columns.filter((c) => (c.mobile ?? "detail") === "detail");

  return (
    <>
      {/* Celular: tarjetas */}
      <ul className="bg-card shadow-toga divide-y overflow-hidden rounded-2xl md:hidden" aria-label={label}>
        {rows.map((row) => (
          <li key={rowKey(row)} className={cn("flex items-start gap-2 py-3 pr-1 pl-4", muted?.(row) && "opacity-60")}>
            <div className="min-w-0 flex-1 space-y-1">
              {title.map((col) => (
                <div key={col.header} className="font-bold">
                  {col.cell(row)}
                </div>
              ))}
              {details.map((col) => (
                <div key={col.header} className="text-muted-foreground text-sm">
                  {col.cell(row)}
                </div>
              ))}
            </div>
            {actions && <div className="shrink-0">{actions(row)}</div>}
          </li>
        ))}
      </ul>

      {/* Escritorio: tabla */}
      <div className="bg-card shadow-toga hidden overflow-hidden rounded-2xl md:block">
        <Table aria-label={label}>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.header} className={cn(col.align === "right" && "text-right", col.className)}>
                  {col.header}
                </TableHead>
              ))}
              {actions && (
                <TableHead className="w-12">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)} className={cn(muted?.(row) && "opacity-60")}>
                {columns.map((col) => (
                  <TableCell key={col.header} className={cn("whitespace-normal", col.align === "right" && "text-right", col.className)}>
                    {col.cell(row)}
                  </TableCell>
                ))}
                {actions && <TableCell className="text-right">{actions(row)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
