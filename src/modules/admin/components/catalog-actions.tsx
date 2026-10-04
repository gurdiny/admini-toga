"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, MoreVertical, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAction } from "@/hooks/use-action";
import type { CategoryType } from "@/generated/prisma/browser";
import { setSupplierActive } from "@/modules/payments/actions/suppliers";
import { moveCategory, setCategoryActive } from "../actions/categories";
import { CategoryFormDialog } from "./category-form-dialog";

export function NewCategoryButton({ type }: { type: CategoryType }) {
  return (
    <CategoryFormDialog
      type={type}
      trigger={
        <Button variant="brand">
          <Plus aria-hidden /> Nueva categoría
        </Button>
      }
    />
  );
}

type CategoryProps = {
  type: CategoryType;
  category: { id: string; name: string; color: string; isActive: boolean; usage: number };
  isFirst: boolean;
  isLast: boolean;
};

export function CategoryRowActions({ type, category, isFirst, isLast }: CategoryProps) {
  const [editing, setEditing] = useState(false);
  const move = useAction(moveCategory);
  const toggle = useAction(setCategoryActive, {
    success: category.isActive
      ? `«${category.name}» desactivada: ya no aparece al capturar.${
          category.usage === 1 ? " El registro que la usa la conserva." : category.usage ? ` Los ${category.usage} registros que la usan la conservan.` : ""
        }`
      : `«${category.name}» activada.`,
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Opciones de ${category.name}`} disabled={move.pending || toggle.pending}>
            <MoreVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil aria-hidden /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isFirst} onSelect={() => move.run({ id: category.id, direction: "up" })}>
            <ArrowUp aria-hidden /> Subir
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isLast} onSelect={() => move.run({ id: category.id, direction: "down" })}>
            <ArrowDown aria-hidden /> Bajar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => toggle.run({ id: category.id, isActive: !category.isActive })}>
            {category.isActive ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            {category.isActive ? "Desactivar" : "Activar"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CategoryFormDialog type={type} category={category} open={editing} onOpenChange={setEditing} />
    </>
  );
}

export function SupplierActiveButton({ supplier }: { supplier: { id: string; name: string; isActive: boolean } }) {
  const toggle = useAction(setSupplierActive, {
    success: supplier.isActive ? `${supplier.name} desactivado: ya no aparece al capturar.` : `${supplier.name} activado.`,
  });
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={toggle.pending}
      onClick={() => toggle.run({ id: supplier.id, isActive: !supplier.isActive })}
      aria-label={`${supplier.isActive ? "Desactivar" : "Activar"} ${supplier.name}`}
    >
      {supplier.isActive ? "Desactivar" : "Activar"}
    </Button>
  );
}
