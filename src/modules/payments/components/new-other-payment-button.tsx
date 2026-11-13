"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OtherPaymentFormDialog } from "./other-payment-form-dialog";

/** Botón «Pago sin proveedor». Es de cliente: el trigger de Radix no se arma en un Server Component. */
export function NewOtherPaymentButton({ variant = "brand", className }: { variant?: "brand" | "outline"; className?: string }) {
  return (
    <OtherPaymentFormDialog
      trigger={
        <Button variant={variant} className={className}>
          <Plus aria-hidden />
          Pago sin proveedor
        </Button>
      }
    />
  );
}
