"use client";

import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Menú «⋮» de una fila con Editar y Borrar. Sin permisos, no se muestra. */
export function RowMenu({ label, onEdit, onDelete }: { label: string; onEdit?: () => void; onDelete?: () => void }) {
  if (!onEdit && !onDelete) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-10" aria-label={`Opciones de ${label}`}>
          <MoreVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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
