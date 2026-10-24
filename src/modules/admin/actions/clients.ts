"use server";

import { defineAction } from "@/lib/action";
import { recordAudit, withAudit } from "@/lib/audit";
import { formatCode } from "@/lib/codes";
import { BusinessError } from "@/lib/errors";
import { toNameKey } from "@/lib/normalize";
import { plural } from "@/lib/text";
import { deleteClientSchema, mergeClientsSchema, updateClientSchema } from "../schemas";

const REVALIDATE = ["/admin/clientes", "/clientes", "/recordatorios"];

export const updateClient = defineAction(
  { role: "OWNER", schema: updateClientSchema, revalidate: REVALIDATE },
  async ({ id, ...data }, { user }) => {
    await withAudit(
      { userId: user.id, action: "UPDATE", entity: "Client", before: (tx) => tx.client.findUnique({ where: { id } }) },
      async (tx) => {
        const current = await tx.client.findFirst({ where: { id, deletedAt: null } });
        if (!current) throw new BusinessError("El cliente ya no existe. Recarga la página.");
        return tx.client.update({ where: { id }, data: { ...data, nameKey: toNameKey(data.name) } });
      },
    );
  },
);

/**
 * Fusiona un cliente capturado dos veces: los pedidos del duplicado pasan al
 * que se queda, y el duplicado se marca como fusionado (deletedAt): deja de
 * salir en búsquedas pero su folio no se reutiliza. Todo en una transacción.
 */
export const mergeClients = defineAction(
  { role: "OWNER", schema: mergeClientsSchema, revalidate: REVALIDATE },
  async ({ keepId, mergeId }, { user }) => {
    const result = await withAudit(
      { userId: user.id, action: "DELETE", entity: "Client", before: (tx) => tx.client.findUnique({ where: { id: mergeId } }) },
      async (tx) => {
        const [keep, merge] = await Promise.all([
          tx.client.findFirst({ where: { id: keepId, deletedAt: null } }),
          tx.client.findFirst({ where: { id: mergeId, deletedAt: null } }),
        ]);
        if (!keep || !merge) throw new BusinessError("Uno de los dos clientes ya no existe. Recarga la página.");

        const orders = await tx.orderReminder.findMany({ where: { clientId: mergeId } });
        for (const order of orders) {
          const after = await tx.orderReminder.update({ where: { id: order.id }, data: { clientId: keepId } });
          await recordAudit(tx, { userId: user.id, action: "UPDATE", entity: "OrderReminder", before: order, after });
        }

        // Lo que le falte al que se queda, lo toma del duplicado.
        const fill = {
          ...(!keep.phone && merge.phone && { phone: merge.phone }),
          ...(!keep.notes && merge.notes && { notes: merge.notes }),
        };
        if (Object.keys(fill).length) {
          const after = await tx.client.update({ where: { id: keepId }, data: fill });
          await recordAudit(tx, { userId: user.id, action: "UPDATE", entity: "Client", before: keep, after });
        }

        const merged = await tx.client.update({
          where: { id: mergeId },
          data: {
            deletedAt: new Date(),
            notes: [merge.notes, `Fusionado con ${formatCode("client", keep.code)} ${keep.name}`].filter(Boolean).join("\n"),
          },
        });
        return Object.assign(merged, { movedOrders: orders.length });
      },
    );
    return { movedOrders: result.movedOrders };
  },
);

/**
 * Borra un cliente y sus pedidos (a la papelera, como todo). Los pagos a
 * proveedores que estaban ligados a esos pedidos se conservan: solo dejan de
 * mostrar el pedido. Con la casilla marcada si el cliente tiene pedidos.
 */
export const softDeleteClient = defineAction(
  { role: "OWNER", schema: deleteClientSchema, revalidate: REVALIDATE },
  async ({ id, confirm }, { user }) => {
    await withAudit(
      { userId: user.id, action: "DELETE", entity: "Client", before: (tx) => tx.client.findUnique({ where: { id } }) },
      async (tx) => {
        const client = await tx.client.findFirst({ where: { id, deletedAt: null } });
        if (!client) throw new BusinessError("El cliente ya no existe. Recarga la página.");

        const orders = await tx.orderReminder.findMany({ where: { clientId: id, deletedAt: null } });
        if (orders.length && !confirm) {
          throw new BusinessError(
            `${client.name} tiene ${plural(orders.length, "pedido", "pedidos")}. Marca la casilla para borrarlo junto con ellos.`,
          );
        }

        const now = new Date();
        for (const order of orders) {
          const after = await tx.orderReminder.update({ where: { id: order.id }, data: { deletedAt: now } });
          await recordAudit(tx, { userId: user.id, action: "DELETE", entity: "OrderReminder", before: order, after });
        }
        return tx.client.update({ where: { id }, data: { deletedAt: now } });
      },
    );
  },
);
