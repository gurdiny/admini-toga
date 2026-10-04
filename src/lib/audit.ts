import "server-only";
import { db } from "@/lib/db";
import { Prisma, type AuditAction } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;
type Row = Record<string, unknown>;

/** Campos que cambian solos y no aportan a la auditoría. */
const IGNORED_FIELDS = new Set(["updatedAt", "createdAt"]);

/** Convierte valores de Prisma (Decimal, Date) a algo guardable en JSON. */
function toJson(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Prisma.Decimal) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
  }
  return value as Prisma.InputJsonValue;
}

function snapshot(row: Row): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !IGNORED_FIELDS.has(key))
      .map(([key, value]) => [key, toJson(value)]),
  );
}

/** Solo los campos que cambiaron: { campo: { from, to } }. */
function diff(before: Row, after: Row): Prisma.InputJsonObject {
  const a = snapshot(before);
  const b = snapshot(after);
  const changes: Record<string, Prisma.InputJsonObject> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      changes[key] = { from: a[key] ?? null, to: b[key] ?? null };
    }
  }
  return changes;
}

type AuditOptions = {
  userId: string;
  action: AuditAction;
  /** Nombre del modelo de Prisma, p. ej. "SupplierPayment". */
  entity: Prisma.ModelName;
  /** Para UPDATE y DELETE: lee el registro antes del cambio, dentro de la misma transacción. */
  before?: (tx: Tx) => Promise<Row | null>;
};

/**
 * Ejecuta una escritura y su registro en AuditLog en una sola transacción:
 * si algo falla, no queda ni el cambio ni la auditoría a medias.
 *
 * Guarda en `changes`:
 * - CREATE: { after: registro completo }
 * - UPDATE: { campo: { from, to } } solo con lo que cambió
 * - DELETE: { before: registro completo } (borrado lógico: `run` pone deletedAt)
 *
 * @example
 * const payment = await withAudit(
 *   { userId: user.id, action: "UPDATE", entity: "SupplierPayment",
 *     before: (tx) => tx.supplierPayment.findUnique({ where: { id } }) },
 *   (tx) => tx.supplierPayment.update({ where: { id }, data }),
 * );
 */
export async function withAudit<T extends { id: string }>(
  options: AuditOptions,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    const before = options.before ? await options.before(tx) : null;
    const result = await run(tx);

    let changes: Prisma.InputJsonObject;
    if (options.action === "CREATE" || !before) {
      changes = { after: snapshot(result) };
    } else if (options.action === "DELETE") {
      changes = { before: snapshot(before) };
    } else {
      changes = diff(before, result);
    }

    await tx.auditLog.create({
      data: {
        userId: options.userId,
        action: options.action,
        entity: options.entity,
        entityId: result.id,
        changes,
      },
    });

    return result;
  });
}
