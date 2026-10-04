-- Protección del saldo de adeudos a proveedores.
--
-- Garantiza en la base, sin depender de la app, que:
--   1. La suma de abonos vigentes de un adeudo nunca excede su monto.
--   2. No se abona a un adeudo eliminado ni en otra moneda.
--   3. No se reduce el monto de un adeudo por debajo de lo ya abonado.
--   4. No se elimina (deletedAt) ni se cambia de moneda un adeudo con abonos vigentes.
--
-- Son triggers AFTER que bloquean la fila del adeudo (FOR UPDATE): dos abonos
-- simultáneos al mismo adeudo se procesan uno tras otro, y el segundo ya ve
-- al primero al sumar.
--
-- El mensaje empieza con un código estable (ABONO_EXCEDE_SALDO, etc.) que la
-- app traduce a un mensaje para el usuario. Prisma no gestiona triggers: no
-- aparecen en schema.prisma ni se detectan como drift.

CREATE OR REPLACE FUNCTION supplier_debt_paid(p_debt_id TEXT)
RETURNS NUMERIC(12, 2)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM("amount"), 0)
  FROM "supplier_payments"
  WHERE "debtId" = p_debt_id AND "deletedAt" IS NULL;
$$;

CREATE OR REPLACE FUNCTION check_payment_against_debt()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_debt "supplier_debts"%ROWTYPE;
  v_paid NUMERIC(12, 2);
BEGIN
  -- Pago de contado o abono eliminado: no afecta ningún saldo hacia arriba.
  IF NEW."debtId" IS NULL OR NEW."deletedAt" IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_debt FROM "supplier_debts" WHERE "id" = NEW."debtId" FOR UPDATE;

  IF v_debt."deletedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'ADEUDO_ELIMINADO: el adeudo ADE-% está eliminado', lpad(v_debt."code"::TEXT, 4, '0')
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."currency" <> v_debt."currency" THEN
    RAISE EXCEPTION 'MONEDA_DISTINTA: el abono es en % y el adeudo ADE-% en %',
      NEW."currency", lpad(v_debt."code"::TEXT, 4, '0'), v_debt."currency"
      USING ERRCODE = 'check_violation';
  END IF;

  v_paid := supplier_debt_paid(v_debt."id");
  IF v_paid > v_debt."amount" THEN
    RAISE EXCEPTION 'ABONO_EXCEDE_SALDO: el adeudo ADE-% es de % y los abonos sumarían %',
      lpad(v_debt."code"::TEXT, 4, '0'), v_debt."amount", v_paid
      USING ERRCODE = 'check_violation',
            DETAIL = format('saldo_disponible=%s', v_debt."amount" - (v_paid - NEW."amount"));
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION check_debt_against_payments()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_paid NUMERIC(12, 2);
BEGIN
  v_paid := supplier_debt_paid(NEW."id");

  IF v_paid > 0 AND NEW."deletedAt" IS NOT NULL AND OLD."deletedAt" IS NULL THEN
    RAISE EXCEPTION 'ADEUDO_CON_ABONOS: el adeudo ADE-% tiene % en abonos vigentes',
      lpad(NEW."code"::TEXT, 4, '0'), v_paid
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_paid > 0 AND NEW."currency" <> OLD."currency" THEN
    RAISE EXCEPTION 'ADEUDO_CON_ABONOS: no se puede cambiar la moneda del adeudo ADE-% porque ya tiene abonos',
      lpad(NEW."code"::TEXT, 4, '0')
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."amount" < v_paid THEN
    RAISE EXCEPTION 'MONTO_MENOR_A_ABONADO: el adeudo ADE-% ya tiene % abonado',
      lpad(NEW."code"::TEXT, 4, '0'), v_paid
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER "supplier_payments_debt_balance"
AFTER INSERT OR UPDATE OF "amount", "debtId", "deletedAt", "currency"
ON "supplier_payments"
FOR EACH ROW EXECUTE FUNCTION check_payment_against_debt();

CREATE TRIGGER "supplier_debts_payments_guard"
AFTER UPDATE OF "amount", "deletedAt", "currency"
ON "supplier_debts"
FOR EACH ROW EXECUTE FUNCTION check_debt_against_payments();
