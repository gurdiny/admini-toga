"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SupplierFormDialog } from "./supplier-form-dialog";

/** Alta de proveedor desde el listado: al guardar, abre su estado de cuenta. */
export function NewSupplierButton() {
  const router = useRouter();
  return (
    <SupplierFormDialog
      onSaved={(supplier) => router.push(`/proveedores/${supplier.id}`)}
      trigger={
        <Button variant="brand">
          <Plus aria-hidden />
          Nuevo proveedor
        </Button>
      }
    />
  );
}
