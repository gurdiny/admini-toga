"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Field, FormError } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { cn } from "@/lib/utils";
import type { CategoryType } from "@/generated/prisma/browser";
import { createCategory, updateCategory } from "../actions/categories";
import { CATEGORY_COLORS } from "../schemas";

type Props = {
  type: CategoryType;
  /** Con `category` edita; sin ella, crea. */
  category?: { id: string; name: string; color: string };
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function CategoryFormDialog({ trigger, open, onOpenChange, ...props }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <CategoryForm {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({ type, category, onDone }: Omit<Props, "trigger" | "open" | "onOpenChange"> & { onDone: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[0]);
  const create = useAction(createCategory, { errorToast: false, success: (c) => `Categoría «${c.name}» creada.`, onSuccess: onDone });
  const update = useAction(updateCategory, { errorToast: false, success: "Categoría actualizada.", onSuccess: onDone });
  const action = category ? update : create;
  const errors = action.fieldErrors;
  const kind = type === "PAYMENT" ? "de pago" : "de proveedor";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (category) update.run({ id: category.id, name, color });
    else create.run({ type, name, color });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{category ? "Editar categoría" : `Nueva categoría ${kind}`}</DialogTitle>
        <DialogDescription>
          {type === "PAYMENT" ? "Qué se compró o qué trabajo se pagó." : "Qué tipo de proveedor es."}
        </DialogDescription>
      </DialogHeader>
      <form id="category-form" onSubmit={submit} className="space-y-4">
        <FormError message={action.error && !Object.keys(errors).length ? action.error : null} />
        <Field label="Nombre" htmlFor="cat-name" required error={errors.name}>
          <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" autoFocus aria-invalid={!!errors.name} />
        </Field>
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-medium">Color</legend>
          <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Color">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                onClick={() => setColor(c)}
                className={cn("flex h-11 items-center justify-center rounded-full ring-offset-2", color === c && "ring-foreground ring-2")}
                style={{ backgroundColor: c }}
              >
                {color === c && <Check className="size-5 text-white" aria-hidden />}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground text-sm">Se usa en los chips y en las gráficas.</p>
        </fieldset>
      </form>
      <DialogFooter>
        <Button type="button" variant="ghost" size="lg" onClick={onDone} disabled={action.pending} className="sm:h-10 sm:text-sm">
          Cancelar
        </Button>
        <Button type="submit" variant="brand" size="lg" form="category-form" disabled={action.pending} className="sm:h-10 sm:text-sm">
          {action.pending ? "Guardando…" : category ? "Guardar cambios" : "Crear categoría"}
        </Button>
      </DialogFooter>
    </>
  );
}
