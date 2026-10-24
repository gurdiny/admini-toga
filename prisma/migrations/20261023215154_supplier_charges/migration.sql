-- Qué se le paga a cada proveedor: metal, mano de obra o ambas.
-- Sustituye al "tipo de proveedor" de una sola opción (Joyería | Mano de obra),
-- que no sabía decir "las dos". Decide qué renglones lleva la nota del proveedor.

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "chargesLabor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "chargesMetal" BOOLEAN NOT NULL DEFAULT false;

-- Backfill desde el tipo que ya tenían:
--   "Mano de obra" (engaste, soldadura, pulido) → solo hechura.
--   "Joyería" o sin tipo → entrega piezas terminadas, así que se le paga
--   el metal y la hechura; el dueño puede destildar lo que no aplique.
UPDATE "suppliers" s
SET "chargesLabor" = true
FROM "categories" c
WHERE c."id" = s."categoryId" AND c."type" = 'SUPPLIER' AND c."nameKey" = 'mano de obra';

UPDATE "suppliers" s
SET "chargesMetal" = true, "chargesLabor" = true
WHERE s."chargesMetal" = false AND s."chargesLabor" = false;

-- CHECK a mano (Prisma no los genera ni los detecta como drift):
-- un proveedor al que no se le paga nada no tiene sentido y dejaría su nota
-- sin renglones posibles.
ALTER TABLE "suppliers"
  ADD CONSTRAINT "suppliers_charges_at_least_one"
  CHECK ("chargesMetal" OR "chargesLabor");
