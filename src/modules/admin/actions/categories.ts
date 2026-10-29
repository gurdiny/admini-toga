"use server";

import { defineAction } from "@/lib/action";
import { recordAudit, withAudit } from "@/lib/audit";
import { canManageCategories } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { AuthorizationError, BusinessError } from "@/lib/errors";
import { toNameKey } from "@/lib/normalize";
import type { CategoryType, Prisma } from "@/generated/prisma/client";
import { categorySchema, moveCategorySchema, setActiveSchema, updateCategorySchema } from "../schemas";

// Las categorías no se borran: se desactivan. Así dejan de aparecer al
// capturar, pero los pagos y proveedores que ya las usan las siguen mostrando.
// Las de pago las maneja también el mostrador (/categorias y «Agregar
// categoría» al registrar un pago); los tipos de proveedor, solo el dueño.
const REVALIDATE = ["/admin/catalogos", "/categorias", "/pagos", "/proveedores"];

function assertCanManage(user: CurrentUser, type: CategoryType) {
  if (!canManageCategories(user, type)) throw new AuthorizationError("Solo el dueño administra los tipos de proveedor.");
}

/** Trae la categoría y verifica que este usuario pueda tocar las de su tipo. */
async function findManageable(tx: Prisma.TransactionClient, user: CurrentUser, id: string) {
  const category = await tx.category.findUnique({ where: { id } });
  if (!category) throw new BusinessError("La categoría ya no existe. Recarga la página.");
  assertCanManage(user, category.type);
  return category;
}

const TYPE_LABEL: Record<CategoryType, string> = { PAYMENT: "de pago", SUPPLIER: "de proveedor" };

async function assertUniqueName(tx: Prisma.TransactionClient, type: CategoryType, name: string, exceptId?: string) {
  const existing = await tx.category.findUnique({ where: { type_nameKey: { type, nameKey: toNameKey(name) } } });
  if (!existing || existing.id === exceptId) return;
  throw new BusinessError(
    existing.isActive
      ? `Ya existe la categoría ${TYPE_LABEL[type]} «${existing.name}».`
      : `Ya existe la categoría ${TYPE_LABEL[type]} «${existing.name}», pero está desactivada. Actívala en vez de crear otra.`,
  );
}

export const createCategory = defineAction(
  { role: "STAFF", schema: categorySchema, revalidate: REVALIDATE },
  async (data, { user }) => {
    assertCanManage(user, data.type);
    const category = await withAudit({ userId: user.id, action: "CREATE", entity: "Category" }, async (tx) => {
      await assertUniqueName(tx, data.type, data.name);
      const last = await tx.category.aggregate({ where: { type: data.type }, _max: { sortOrder: true } });
      return tx.category.create({
        data: { ...data, nameKey: toNameKey(data.name), sortOrder: (last._max.sortOrder ?? -1) + 1 },
      });
    });
    return { id: category.id, name: category.name, color: category.color };
  },
);

export const updateCategory = defineAction(
  { role: "STAFF", schema: updateCategorySchema, revalidate: REVALIDATE },
  async ({ id, ...data }, { user }) => {
    await withAudit(
      { userId: user.id, action: "UPDATE", entity: "Category", before: (tx) => tx.category.findUnique({ where: { id } }) },
      async (tx) => {
        const current = await findManageable(tx, user, id);
        await assertUniqueName(tx, current.type, data.name, id);
        return tx.category.update({ where: { id }, data: { ...data, nameKey: toNameKey(data.name) } });
      },
    );
  },
);

export const setCategoryActive = defineAction(
  { role: "STAFF", schema: setActiveSchema, revalidate: REVALIDATE },
  async ({ id, isActive }, { user }) => {
    await withAudit(
      { userId: user.id, action: "UPDATE", entity: "Category", before: (tx) => tx.category.findUnique({ where: { id } }) },
      async (tx) => {
        const current = await findManageable(tx, user, id);
        // Nunca sin categorías para capturar: el pago exige una.
        if (!isActive && current.isActive && current.type === "PAYMENT") {
          const active = await tx.category.count({ where: { type: "PAYMENT", isActive: true } });
          if (active <= 1) throw new BusinessError("Es la última categoría activa: agrega otra antes de quitar esta.");
        }
        return tx.category.update({ where: { id }, data: { isActive } });
      },
    );
  },
);

/** Sube o baja una posición y renumera el tipo completo (0, 1, 2…). */
export const moveCategory = defineAction(
  { role: "STAFF", schema: moveCategorySchema, revalidate: REVALIDATE },
  async ({ id, direction }, { user }) => {
    await db.$transaction(async (tx) => {
      const current = await findManageable(tx, user, id);
      const list = await tx.category.findMany({ where: { type: current.type }, orderBy: [{ sortOrder: "asc" }, { nameKey: "asc" }] });
      const from = list.findIndex((c) => c.id === id);
      const to = direction === "up" ? from - 1 : from + 1;
      if (to < 0 || to >= list.length) return;
      [list[from], list[to]] = [list[to], list[from]];
      for (const [index, category] of list.entries()) {
        if (category.sortOrder === index) continue;
        const after = await tx.category.update({ where: { id: category.id }, data: { sortOrder: index } });
        await recordAudit(tx, { userId: user.id, action: "UPDATE", entity: "Category", before: category, after });
      }
    });
  },
);
