"use client";

import { Eye, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Menú «⋮» de una fila: Ver detalle, Editar y Borrar. Sin ninguna acción, no se muestra. */
export function RowMenu({
  label,
  onView,
  onEdit,
  onDelete,
}: {
  label: string;
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  if (!onView && !onEdit && !onDelete) return null;
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
