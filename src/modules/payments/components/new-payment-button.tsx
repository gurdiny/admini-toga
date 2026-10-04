"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaymentMethod } from "@/generated/prisma/browser";
import type { CaptureOptions } from "../queries";
import { PaymentFormDialog } from "./payment-form-dialog";

export function NewPaymentButton({ options, defaultMethod }: { options: CaptureOptions; defaultMethod: PaymentMethod }) {
  return (
    <PaymentFormDialog
      options={options}
      defaultMethod={defaultMethod}
      trigger={
        <Button className="h-11 md:h-9">
          <Plus aria-hidden />
          Registrar pago
        </Button>
      }
    />
  );
}
