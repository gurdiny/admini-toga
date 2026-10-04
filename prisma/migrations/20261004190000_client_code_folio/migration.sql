-- DropIndex
DROP INDEX "clients_folio_idx";

-- DropIndex
DROP INDEX "clients_folio_key";

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "folio",
ADD COLUMN     "code" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "clients_code_key" ON "clients"("code");

