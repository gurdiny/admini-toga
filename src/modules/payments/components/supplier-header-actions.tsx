"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { plural } from "@/lib/text";
import type { PaymentMethod } from "@/generated/prisma/browser";
import { setSupplierActive, softDeleteSupplier } from "../actions/suppliers";
import type { CaptureOptions } from "../queries";
import { DebtFormDialog } from "./debt-form-dialog";
import { PaymentFormDialog } from "./payment-form-dialog";
import { SupplierFormDialog, type SupplierFormValues } from "./supplier-form-dialog";

type Props = {
  supplier: SupplierFormValues & { isActive: boolean };
  options: CaptureOptions;
  defaultMethod: PaymentMethod;
  canToggleActive: boolean;
  /** Qué se lleva el borrado: sus notas vigentes y sus pagos. */
  counts: { debts: number; payments: number };
};

export function SupplierHeaderActions({ supplier, options, defaultMethod, canToggleActive, counts }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const toggle = useAction(setSupplierActive, {
    success: supplier.isActive ? "Proveedor desactivado: ya no aparece al capturar." : "Proveedor activado.",
  });
  const hasMovements = counts.debts > 0 || counts.payments > 0;
  const remove = useAction(softDeleteSupplier, {
    success: `${supplier.name} se fue a la papelera.`,
    onSuccess: () => {
      setDeleting(false);
      router.push("/proveedores");
    },
  });

  return (
    // Celular: cuadrícula de 2 con la acción principal a todo lo ancho.
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
      {supplier.isActive && (
        <>
          <PaymentFormDialog
            options={options}
            defaultMethod={defaultMethod}
            preset={{ supplierId: supplier.id }}
            trigger={
              <Button variant="brand" className="col-span-2">
                Registrar pago
              </Button>
            }
          />
          <DebtFormDialog
            supplierId={supplier.id}
            supplierName={supplier.name}
            categories={options.paymentCategories}
            defaultCurrency={options.defaults.currency}
            trigger={
              <Button variant="outline">
                <Plus aria-hidden />
                Nuevo adeudo
              </Button>
            }
          />
        </>
      )}
      <SupplierFormDialog
        supplier={supplier}
        trigger={
          <Button variant="outline">
            <Pencil aria-hidden />
            Editar
          </Button>
        }
      />
      {canToggleActive && (
        <Button
          variant="ghost"
          className="text-muted-foreground col-span-2"
          disabled={toggle.pending}
          onClick={() => toggle.run({ id: supplier.id, isActive: !supplier.isActive })}
        >
          {supplier.isActive ? "Desactivar" : "Activar"}
        </Button>
      )}
      {canToggleActive && (
        <>
          <Button
            variant="ghost"
            className="text-destructive col-span-2"
            onClick={() => setDeleting(true)}
          >
            <Trash2 aria-hidden />
            Borrar proveedor
          </Button>
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title={`¿Borrar a ${supplier.name}?`}
            description={
              hasMovements ? (
                <>
                  Se borran también <strong>{plural(counts.debts, "adeudo", "adeudos")}</strong> y{" "}
                  <strong>{plural(counts.payments, "pago", "pagos")}</strong> suyos, que dejarán de contar en los
                  totales. Todo se puede restaurar desde la papelera.
                </>
              ) : (
                <>Todavía no tiene adeudos ni pagos. Se puede restaurar desde la papelera.</>
              )
            }
            requireCheck={
              hasMovements
                ? `Sí, bórralo con sus ${plural(counts.debts, "adeudo", "adeudos")} y ${plural(counts.payments, "pago", "pagos")}.`
                : null
            }
            pending={remove.pending}
            onConfirm={(confirmed) => remove.run({ id: supplier.id, confirm: confirmed })}
          />
        </>
      )}
    </div>
  );
}
