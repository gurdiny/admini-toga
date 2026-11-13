-- CreateTable
CREATE TABLE "other_payments" (
    "id" TEXT NOT NULL,
    "code" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "time" CHAR(5) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "note" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "other_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "other_payments_code_key" ON "other_payments"("code");

-- CreateIndex
CREATE INDEX "other_payments_date_idx" ON "other_payments"("date");

-- CreateIndex
CREATE INDEX "other_payments_deletedAt_idx" ON "other_payments"("deletedAt");

-- AddForeignKey
ALTER TABLE "other_payments" ADD CONSTRAINT "other_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que Prisma no genera (se agregan a mano).
ALTER TABLE "other_payments"
  ADD CONSTRAINT "other_payments_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "other_payments_time_format" CHECK ("time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "other_payments_note_not_blank" CHECK (btrim("note") <> '');
