-- Los proveedores también se borran a la papelera, nunca de verdad.
-- Al borrar uno se marcan igual sus notas y sus pagos, para que dejen de
-- contar en los totales; desde /admin/papelera se puede restaurar.

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "suppliers_deletedAt_idx" ON "suppliers"("deletedAt");
