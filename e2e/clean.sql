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
-- Recordatorios: nota con «E2E» o cliente con «E2E» en el nombre.
DELETE FROM audit_logs WHERE "entityId" IN (
  SELECT r.id FROM order_reminders r JOIN clients c ON c.id = r."clientId" WHERE r.note LIKE '%E2E%' OR c.name LIKE '%E2E%'
  UNION SELECT id FROM clients WHERE name LIKE '%E2E%'
);
DELETE FROM order_reminders WHERE note LIKE '%E2E%' OR "clientId" IN (SELECT id FROM clients WHERE name LIKE '%E2E%');
DELETE FROM clients WHERE name LIKE '%E2E%';
-- Panel de administración: categorías y usuarios de prueba.
DELETE FROM audit_logs WHERE "entityId" IN (SELECT id FROM categories WHERE name LIKE '%E2E%');
DELETE FROM categories WHERE name LIKE '%E2E%';
DELETE FROM audit_logs WHERE "entityId" IN (SELECT id FROM users WHERE email LIKE '%e2e%') OR "userId" IN (SELECT id FROM users WHERE email LIKE '%e2e%');
DELETE FROM sessions WHERE "userId" IN (SELECT id FROM users WHERE email LIKE '%e2e%');
DELETE FROM accounts WHERE "userId" IN (SELECT id FROM users WHERE email LIKE '%e2e%');
DELETE FROM users WHERE email LIKE '%e2e%';
