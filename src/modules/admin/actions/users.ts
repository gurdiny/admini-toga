"use server";

import { hashPassword } from "better-auth/crypto";
import { defineAction } from "@/lib/action";
import { recordAudit, withAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";
import { leavesNoActiveOwner } from "../rules";
import { createUserSchema, resetPasswordSchema, setActiveSchema, updateUserSchema } from "../schemas";

// El registro público está apagado: los usuarios los crea el dueño aquí. La
// contraseña se guarda igual que la guarda Better Auth (hash en Account con
// providerId "credential"), así el login normal funciona sin cambios.
// La auditoría nunca guarda el hash.

const REVALIDATE = ["/admin/usuarios"];
const NO_OWNER = "Debe quedar al menos un dueño activo: si no, nadie podría entrar a Administración.";

async function assertKeepsOwner(tx: Prisma.TransactionClient, change: Parameters<typeof leavesNoActiveOwner>[1]) {
  const users = await tx.user.findMany({ select: { id: true, role: true, isActive: true } });
  if (leavesNoActiveOwner(users, change)) throw new BusinessError(NO_OWNER);
}

async function setCredential(tx: Prisma.TransactionClient, userId: string, password: string) {
  const hash = await hashPassword(password);
  const account = await tx.account.findFirst({ where: { userId, providerId: "credential" } });
  if (account) await tx.account.update({ where: { id: account.id }, data: { password: hash } });
  else await tx.account.create({ data: { userId, accountId: userId, providerId: "credential", password: hash } });
}

export const createUser = defineAction(
  { role: "OWNER", schema: createUserSchema, revalidate: REVALIDATE },
  async ({ password, ...data }, { user }) => {
    const created = await withAudit({ userId: user.id, action: "CREATE", entity: "User" }, async (tx) => {
      const existing = await tx.user.findUnique({ where: { email: data.email }, select: { isActive: true } });
      if (existing) {
        throw new BusinessError(
          existing.isActive ? "Ya existe un usuario con ese correo." : "Ese correo es de un usuario desactivado. Actívalo en vez de crear otro.",
        );
      }
      const newUser = await tx.user.create({ data: { ...data, emailVerified: true } });
      await setCredential(tx, newUser.id, password);
      return newUser;
    });
    return { id: created.id, name: created.name };
  },
);

export const updateUser = defineAction(
  { role: "OWNER", schema: updateUserSchema, revalidate: REVALIDATE },
  async ({ id, ...data }, { user }) => {
    await withAudit(
      { userId: user.id, action: "UPDATE", entity: "User", before: (tx) => tx.user.findUnique({ where: { id } }) },
      async (tx) => {
        await assertKeepsOwner(tx, { id, role: data.role });
        return tx.user.update({ where: { id }, data });
      },
    );
  },
);

/** Desactivar cierra sus sesiones: queda fuera al instante, sin borrar su historial. */
export const setUserActive = defineAction(
  { role: "OWNER", schema: setActiveSchema, revalidate: REVALIDATE },
  async ({ id, isActive }, { user }) => {
    if (id === user.id && !isActive) throw new BusinessError("No puedes desactivarte a ti mismo.");
    await withAudit(
      { userId: user.id, action: "UPDATE", entity: "User", before: (tx) => tx.user.findUnique({ where: { id } }) },
      async (tx) => {
        await assertKeepsOwner(tx, { id, isActive });
        if (!isActive) await tx.session.deleteMany({ where: { userId: id } });
        return tx.user.update({ where: { id }, data: { isActive } });
      },
    );
  },
);

/** Nueva contraseña. Cierra sus otras sesiones (si es la tuya, conservas esta). */
export const resetPassword = defineAction(
  { role: "OWNER", schema: resetPasswordSchema, revalidate: REVALIDATE },
  async ({ userId, password }, { user }) => {
    await db.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!target) throw new BusinessError("El usuario ya no existe. Recarga la página.");
      await setCredential(tx, userId, password);
      if (userId !== user.id) await tx.session.deleteMany({ where: { userId } });
      // Solo queda constancia de que cambió, nunca el hash.
      await recordAudit(tx, {
        userId: user.id,
        action: "UPDATE",
        entity: "User",
        before: { id: userId, password: "anterior" },
        after: { id: userId, password: "cambiada" },
      });
    });
  },
);
