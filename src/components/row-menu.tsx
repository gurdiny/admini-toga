"use client";

import { Eye, MoreVertical, Pencil, Trash2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RowMenuItem = { label: string; icon: LucideIcon; onSelect: () => void };

/**
 * Menú «⋮» de una fila: Ver detalle, acciones propias (`items`), Editar y
 * Borrar. Sin ninguna acción, no se muestra.
 */
export function RowMenu({
  label,
  onView,
  items = [],
  onEdit,
  onDelete,
}: {
  label: string;
  onView?: () => void;
  items?: RowMenuItem[];
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  if (!onView && !items.length && !onEdit && !onDelete) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-10" aria-label={`Opciones de ${label}`}>
          <MoreVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onView && (
          <DropdownMenuItem onSelect={onView}>
            <Eye aria-hidden />
            Ver detalle
          </DropdownMenuItem>
        )}
        {items.map(({ label, icon: Icon, onSelect }) => (
          <DropdownMenuItem key={label} onSelect={onSelect}>
            <Icon aria-hidden />
            {label}
          </DropdownMenuItem>
        ))}
        {onEdit && (
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil aria-hidden />
            Editar
          </DropdownMenuItem>
        )}
        {onDelete && (
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 aria-hidden />
            Borrar
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
