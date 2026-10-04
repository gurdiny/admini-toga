-- CreateEnum
CREATE TYPE "DebtKind" AS ENUM ('OPENING_BALANCE', 'CREDIT');

-- AlterTable
ALTER TABLE "supplier_payments" DROP COLUMN "status",
ADD COLUMN     "code" SERIAL NOT NULL,
ADD COLUMN     "debtId" TEXT;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "address" TEXT,
ADD COLUMN     "code" SERIAL NOT NULL,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "hasWhatsApp" BOOLEAN NOT NULL DEFAULT false;

-- DropEnum
DROP TYPE "PaymentStatus";

-- CreateTable
CREATE TABLE "supplier_debts" (
    "id" TEXT NOT NULL,
    "code" SERIAL NOT NULL,
    "supplierId" TEXT NOT NULL,
    "kind" "DebtKind" NOT NULL DEFAULT 'CREDIT',
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "categoryId" TEXT,
    "dueDate" DATE,
    "supplierRef" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_debts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_debts_code_key" ON "supplier_debts"("code");

-- CreateIndex
CREATE INDEX "supplier_debts_supplierId_date_idx" ON "supplier_debts"("supplierId", "date");

-- CreateIndex
CREATE INDEX "supplier_debts_deletedAt_idx" ON "supplier_debts"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_debts_id_supplierId_key" ON "supplier_debts"("id", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_code_key" ON "supplier_payments"("code");

-- CreateIndex
CREATE INDEX "supplier_payments_debtId_idx" ON "supplier_payments"("debtId");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- AddForeignKey
ALTER TABLE "supplier_debts" ADD CONSTRAINT "supplier_debts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_debts" ADD CONSTRAINT "supplier_debts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_debts" ADD CONSTRAINT "supplier_debts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_debtId_supplierId_fkey" FOREIGN KEY ("debtId", "supplierId") REFERENCES "supplier_debts"("id", "supplierId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Montos siempre positivos (Prisma no expresa CHECK; se agregan a mano).
ALTER TABLE "supplier_debts" ADD CONSTRAINT "supplier_debts_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_amount_positive" CHECK ("amount" > 0);
