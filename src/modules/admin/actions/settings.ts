"use server";

import { defineAction } from "@/lib/action";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { settingsSchema } from "../schemas";

/**
 * Guarda solo lo que cambió, cada ajuste con su auditoría (antes → después).
 * Revalida toda la app: los módulos y valores por defecto afectan cualquier pantalla.
 */
export const saveSettings = defineAction(
  { role: "OWNER", schema: settingsSchema, revalidate: ["/"] },
  async (data, { user }) => {
    let changed = 0;
    await db.$transaction(async (tx) => {
      const rows = await tx.appSetting.findMany({ where: { key: { in: Object.keys(data) } } });
      const byKey = new Map(rows.map((row) => [row.key, row]));
      for (const [key, value] of Object.entries(data) as [string, Prisma.InputJsonValue][]) {
        const current = byKey.get(key);
        if (current && JSON.stringify(current.value) === JSON.stringify(value)) continue;
        changed++;
        if (current) {
          const after = await tx.appSetting.update({ where: { key }, data: { value } });
          await recordAudit(tx, { userId: user.id, action: "UPDATE", entity: "AppSetting", before: current, after });
        } else {
          const after = await tx.appSetting.create({ data: { key, value } });
          await recordAudit(tx, { userId: user.id, action: "CREATE", entity: "AppSetting", after });
        }
      }
    });
    return { changed };
  },
);
