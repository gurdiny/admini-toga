"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaymentMethod } from "@/generated/prisma/browser";
import type { CaptureOptions, PaymentOrderRef } from "../queries";
import { PaymentFormDialog } from "./payment-form-dialog";

/**
 * «Registrar pago de este pedido» en el historial del cliente. El botón se
 * arma aquí (cliente): un elemento creado en el servidor no sirve como
 * disparador del diálogo al navegar sin recargar.
 */
export function OrderPaymentButton({ options, defaultMethod, order }: { options: CaptureOptions; defaultMethod: PaymentMethod; order: PaymentOrderRef }) {
  return (
    <PaymentFormDialog
      options={options}
      defaultMethod={defaultMethod}
      title="Registrar pago del pedido"
      preset={{ order }}
      trigger={
        <Button variant="outline" className="h-10 w-full bg-transparent sm:w-auto">
          <Plus aria-hidden />
          Registrar pago de este pedido
        </Button>
      }
    />
  );
}
