-- La nota del proveedor va partida en dos renglones: el metal (la plata que
-- entrega) y la hechura (engaste, soldadura, pulido, grabado). Un pago de
-- $6,000 puede ser $5,000 de metal y $1,000 de mano de obra, y cada mitad
-- baja su propio saldo.
--
-- `amount` se queda como el total (lo usan listados, reportes y exportación)
-- y un CHECK garantiza que siempre sea la suma de los dos renglones: así
-- ningún total se recalcula al vuelo.

-- AlterTable
ALTER TABLE "supplier_debts"
  ADD COLUMN "amountMetal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "amountLabor" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "supplier_payments"
  ADD COLUMN "amountMetal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "amountLabor" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- ─── Backfill ──────────────────────────────────────────────────────────────
-- Lo que ya existe no sabe de renglones, así que cada adeudo se va completo
-- al renglón que le corresponde: hechura si su categoría de gasto era «Mano
-- de obra» o si al proveedor solo se le paga hechura; metal en los demás.

UPDATE "supplier_debts" d
SET "amountLabor" = d."amount"
WHERE EXISTS (
        SELECT 1 FROM "categories" c
        WHERE c."id" = d."categoryId" AND c."type" = 'PAYMENT' AND c."nameKey" = 'mano de obra'
      )
   OR EXISTS (
        SELECT 1 FROM "suppliers" s
        WHERE s."id" = d."supplierId" AND s."chargesMetal" = false
      );

UPDATE "supplier_debts" SET "amountMetal" = "amount" WHERE "amountLabor" = 0;

-- Los abonos heredan el renglón de su adeudo (que quedó entero de un lado).
UPDATE "supplier_payments" p
SET "amountLabor" = p."amount"
FROM "supplier_debts" d
WHERE d."id" = p."debtId" AND d."amountLabor" > 0;

UPDATE "supplier_payments" p
SET "amountMetal" = p."amount"
FROM "supplier_debts" d
WHERE d."id" = p."debtId" AND d."amountMetal" > 0 AND p."amountLabor" = 0;

-- Pagos de contado: mismo criterio que los adeudos.
UPDATE "supplier_payments" p
SET "amountLabor" = p."amount"
WHERE p."debtId" IS NULL
  AND (
        EXISTS (
          SELECT 1 FROM "categories" c
          WHERE c."id" = p."categoryId" AND c."type" = 'PAYMENT' AND c."nameKey" = 'mano de obra'
        )
     OR EXISTS (
          SELECT 1 FROM "suppliers" s
          WHERE s."id" = p."supplierId" AND s."chargesMetal" = false
        )
      );

UPDATE "supplier_payments" SET "amountMetal" = "amount" WHERE "amountMetal" = 0 AND "amountLabor" = 0;

-- ─── CHECK a mano (Prisma no los genera ni los detecta como drift) ─────────
ALTER TABLE "supplier_debts"
  ADD CONSTRAINT "supplier_debts_amount_split" CHECK ("amount" = "amountMetal" + "amountLabor"),
  ADD CONSTRAINT "supplier_debts_split_not_negative" CHECK ("amountMetal" >= 0 AND "amountLabor" >= 0);

ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_amount_split" CHECK ("amount" = "amountMetal" + "amountLabor"),
  ADD CONSTRAINT "supplier_payments_split_not_negative" CHECK ("amountMetal" >= 0 AND "amountLabor" >= 0);

-- ─── Los triggers del saldo ahora cuidan cada renglón ──────────────────────
-- Antes bastaba con que la suma de abonos no pasara del monto del adeudo.
-- Ahora el metal no puede pagar hechura ni al revés, así que se compara
-- renglón contra renglón. El mensaje sigue empezando con el código estable
-- (ABONO_EXCEDE_SALDO, MONTO_MENOR_A_ABONADO) y lleva el renglón entre
-- corchetes para que la app lo diga en español.

CREATE OR REPLACE FUNCTION supplier_debt_paid_metal(p_debt_id TEXT)
RETURNS NUMERIC(12, 2)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM("amountMetal"), 0)
  FROM "supplier_payments"
  WHERE "debtId" = p_debt_id AND "deletedAt" IS NULL;
$$;

CREATE OR REPLACE FUNCTION supplier_debt_paid_labor(p_debt_id TEXT)
RETURNS NUMERIC(12, 2)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM("amountLabor"), 0)
  FROM "supplier_payments"
  WHERE "debtId" = p_debt_id AND "deletedAt" IS NULL;
$$;

CREATE OR REPLACE FUNCTION check_payment_against_debt()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_debt "supplier_debts"%ROWTYPE;
  v_code TEXT;
  v_paid NUMERIC(12, 2);
BEGIN
  -- Pago de contado o abono eliminado: no afecta ningún saldo hacia arriba.
  IF NEW."debtId" IS NULL OR NEW."deletedAt" IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_debt FROM "supplier_debts" WHERE "id" = NEW."debtId" FOR UPDATE;
  v_code := lpad(v_debt."code"::TEXT, 4, '0');

  IF v_debt."deletedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'ADEUDO_ELIMINADO: el adeudo ADE-% está eliminado', v_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."currency" <> v_debt."currency" THEN
    RAISE EXCEPTION 'MONEDA_DISTINTA: el abono es en % y el adeudo ADE-% en %',
      NEW."currency", v_code, v_debt."currency"
      USING ERRCODE = 'check_violation';
  END IF;

  v_paid := supplier_debt_paid_metal(v_debt."id");
  IF v_paid > v_debt."amountMetal" THEN
    RAISE EXCEPTION 'ABONO_EXCEDE_SALDO: el renglón de metal del adeudo ADE-% es de % y los abonos sumarían % [metal]',
      v_code, v_debt."amountMetal", v_paid
      USING ERRCODE = 'check_violation',
            DETAIL = format('saldo_disponible=%s', v_debt."amountMetal" - (v_paid - NEW."amountMetal"));
  END IF;

  v_paid := supplier_debt_paid_labor(v_debt."id");
  IF v_paid > v_debt."amountLabor" THEN
    RAISE EXCEPTION 'ABONO_EXCEDE_SALDO: el renglón de hechura del adeudo ADE-% es de % y los abonos sumarían % [mano de obra]',
      v_code, v_debt."amountLabor", v_paid
      USING ERRCODE = 'check_violation',
            DETAIL = format('saldo_disponible=%s', v_debt."amountLabor" - (v_paid - NEW."amountLabor"));
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION check_debt_against_payments()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_code TEXT;
  v_paid NUMERIC(12, 2);
BEGIN
  v_code := lpad(NEW."code"::TEXT, 4, '0');
  v_paid := supplier_debt_paid(NEW."id");

  IF v_paid > 0 AND NEW."deletedAt" IS NOT NULL AND OLD."deletedAt" IS NULL THEN
    RAISE EXCEPTION 'ADEUDO_CON_ABONOS: el adeudo ADE-% tiene % en abonos vigentes', v_code, v_paid
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_paid > 0 AND NEW."currency" <> OLD."currency" THEN
    RAISE EXCEPTION 'ADEUDO_CON_ABONOS: no se puede cambiar la moneda del adeudo ADE-% porque ya tiene abonos', v_code
      USING ERRCODE = 'check_violation';
  END IF;

  v_paid := supplier_debt_paid_metal(NEW."id");
  IF NEW."amountMetal" < v_paid THEN
    RAISE EXCEPTION 'MONTO_MENOR_A_ABONADO: el renglón de metal del adeudo ADE-% ya tiene % abonado [metal]', v_code, v_paid
      USING ERRCODE = 'check_violation';
  END IF;

  v_paid := supplier_debt_paid_labor(NEW."id");
  IF NEW."amountLabor" < v_paid THEN
    RAISE EXCEPTION 'MONTO_MENOR_A_ABONADO: el renglón de hechura del adeudo ADE-% ya tiene % abonado [mano de obra]', v_code, v_paid
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS "supplier_payments_debt_balance" ON "supplier_payments";
CREATE TRIGGER "supplier_payments_debt_balance"
AFTER INSERT OR UPDATE OF "amount", "amountMetal", "amountLabor", "debtId", "deletedAt", "currency"
ON "supplier_payments"
FOR EACH ROW EXECUTE FUNCTION check_payment_against_debt();

DROP TRIGGER IF EXISTS "supplier_debts_payments_guard" ON "supplier_debts";
CREATE TRIGGER "supplier_debts_payments_guard"
AFTER UPDATE OF "amount", "amountMetal", "amountLabor", "deletedAt", "currency"
ON "supplier_debts"
FOR EACH ROW EXECUTE FUNCTION check_debt_against_payments();

-- ─── La categoría de pago «Mano de obra» ya no hace falta ──────────────────
-- El renglón de la nota dice si es hechura. Las categorías no se borran, se
-- desactivan: los pagos viejos conservan la suya y se siguen viendo.
UPDATE "categories"
SET "isActive" = false, "updatedAt" = NOW()
WHERE "type" = 'PAYMENT' AND "nameKey" = 'mano de obra';
