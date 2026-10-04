"use client";

import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import type { PaymentMethod } from "@/generated/prisma/browser";
import { setSupplierActive } from "../actions/suppliers";
import type { CaptureOptions } from "../queries";
import { DebtFormDialog } from "./debt-form-dialog";
import { PaymentFormDialog } from "./payment-form-dialog";
import { SupplierFormDialog, type SupplierFormValues } from "./supplier-form-dialog";

type Props = {
  supplier: SupplierFormValues & { isActive: boolean };
  options: CaptureOptions;
  defaultMethod: PaymentMethod;
  canToggleActive: boolean;
};

export function SupplierHeaderActions({ supplier, options, defaultMethod, canToggleActive }: Props) {
  const toggle = useAction(setSupplierActive, {
    success: supplier.isActive ? "Proveedor desactivado: ya no aparece al capturar." : "Proveedor activado.",
  });

  return (
    <div className="flex flex-wrap gap-2">
      {supplier.isActive && (
        <>
          <PaymentFormDialog
            options={options}
            defaultMethod={defaultMethod}
            preset={{ supplierId: supplier.id }}
            trigger={<Button className="h-11 md:h-9">Registrar pago</Button>}
          />
          <DebtFormDialog
            supplierId={supplier.id}
            supplierName={supplier.name}
            categories={options.paymentCategories}
            trigger={
              <Button variant="outline" className="h-11 md:h-9">
                <Plus aria-hidden />
                Nuevo adeudo
              </Button>
            }
          />
        </>
      )}
      <SupplierFormDialog
        categories={options.supplierCategories}
        supplier={supplier}
        trigger={
          <Button variant="outline" className="h-11 md:h-9">
            <Pencil aria-hidden />
            Editar
          </Button>
        }
      />
      {canToggleActive && (
        <Button
          variant="ghost"
          className="h-11 md:h-9"
          disabled={toggle.pending}
          onClick={() => toggle.run({ id: supplier.id, isActive: !supplier.isActive })}
        >
          {supplier.isActive ? "Desactivar" : "Activar"}
        </Button>
      )}
    </div>
  );
}
