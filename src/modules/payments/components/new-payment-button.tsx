"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaymentMethod } from "@/generated/prisma/browser";
import type { CaptureOptions } from "../queries";
import { PaymentFormDialog } from "./payment-form-dialog";

export function NewPaymentButton({
  options,
  defaultMethod,
  className,
}: {
  options: CaptureOptions;
  defaultMethod: PaymentMethod;
  className?: string;
}) {
  return (
    <PaymentFormDialog
      options={options}
      defaultMethod={defaultMethod}
      trigger={
        <Button variant="brand" className={className}>
          <Plus aria-hidden />
          Registrar pago
        </Button>
      }
    />
  );
}
