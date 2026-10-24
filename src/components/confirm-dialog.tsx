"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  pending?: boolean;
  /**
   * Casilla que hay que marcar para poder borrar. Se usa cuando el borrado se
   * lleva más cosas por delante: una nota con sus abonos, un proveedor con
   * todo su historial. Sin ella el botón rojo no se habilita.
   */
  requireCheck?: string | null;
  onConfirm: (confirmed: boolean) => void;
};

/** Confirmación antes de borrar. El botón rojo no cierra hasta que termina la acción. */
export function ConfirmDialog({ open, onOpenChange, ...props }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* El cuerpo se desmonta al cerrar: así la casilla siempre arranca sin marcar. */}
      <AlertDialogContent>{open && <ConfirmBody {...props} />}</AlertDialogContent>
    </AlertDialog>
  );
}

function ConfirmBody({
  title,
  description,
  confirmLabel = "Borrar",
  pending,
  requireCheck,
  onConfirm,
}: Omit<Props, "open" | "onOpenChange">) {
  const [checked, setChecked] = useState(false);

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div>{description}</div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      {requireCheck && (
        <label className="border-destructive/40 bg-destructive/5 flex min-h-11 items-start gap-3 rounded-lg border p-3 text-sm font-bold">
          <input
            type="checkbox"
            className="accent-destructive mt-0.5 size-5 shrink-0"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span className="min-w-0">{requireCheck}</span>
        </label>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={pending || (!!requireCheck && !checked)}
          onClick={(event) => {
            event.preventDefault();
            onConfirm(checked);
          }}
        >
          {pending ? "Borrando…" : confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}
