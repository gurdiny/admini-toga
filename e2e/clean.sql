-- Borra los registros creados por las pruebas E2E (nombre o concepto con «E2E»).
-- Borrado FÍSICO a propósito: son datos de prueba. Nunca correr en producción.
DELETE FROM audit_logs WHERE "entityId" IN (
  SELECT id FROM suppliers WHERE name LIKE '%E2E%'
  UNION SELECT d.id FROM supplier_debts d JOIN suppliers s ON s.id = d."supplierId" WHERE s.name LIKE '%E2E%'
  UNION SELECT p.id FROM supplier_payments p JOIN suppliers s ON s.id = p."supplierId" WHERE s.name LIKE '%E2E%' OR p.concept LIKE '%E2E%'
);
DELETE FROM supplier_payments WHERE concept LIKE '%E2E%' OR "supplierId" IN (SELECT id FROM suppliers WHERE name LIKE '%E2E%');
DELETE FROM supplier_debts WHERE "supplierId" IN (SELECT id FROM suppliers WHERE name LIKE '%E2E%');
DELETE FROM suppliers WHERE name LIKE '%E2E%';
