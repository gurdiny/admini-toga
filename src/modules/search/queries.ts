import "server-only";
import { db } from "@/lib/db";
import { formatCode, parseCode } from "@/lib/codes";
import { dbToDay, formatDay } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { toNameKey } from "@/lib/normalize";
import { formatPhone } from "@/components/phone-link";
import type { ModuleKey } from "@/lib/settings";

// Búsqueda global (⌘K y lupa del encabezado). Devuelve resultados ya listos
// para pintar: título, detalle y a dónde llevan. Cada grupo trae pocos
// resultados; para ver más está el buscador de cada pantalla.

export type SearchHit = { id: string; title: string; detail: string; href: string };
export type SearchResults = { clients: SearchHit[]; payments: SearchHit[]; suppliers: SearchHit[] };

const TAKE = 6;

export async function globalSearch(query: string, modules: Record<ModuleKey, boolean>): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return { clients: [], payments: [], suppliers: [] };
  const key = toNameKey(q);
  const digits = q.replace(/\D/g, "");
  const clientCode = parseCode(q, "client");
  const paymentCode = parseCode(q, "payment");
  const supplierCode = parseCode(q, "supplier");

  const [clients, payments, suppliers] = await Promise.all([
    modules.reminders
      ? db.client.findMany({
          where: {
            deletedAt: null,
            OR: [
              { nameKey: { contains: key } },
              ...(clientCode !== null ? [{ code: clientCode }] : []),
              ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
            ],
          },
          // El folio exacto primero: «CLI-0005» o «5» llega directo al cliente.
          orderBy: { nameKey: "asc" },
          take: 20,
          select: { id: true, code: true, name: true, phone: true },
        })
      : [],
    modules.payments
      ? db.supplierPayment.findMany({
          where: {
            deletedAt: null,
            OR: [
              { concept: { contains: q, mode: "insensitive" } },
              { supplier: { nameKey: { contains: key } } },
              ...(paymentCode !== null ? [{ code: paymentCode }] : []),
            ],
          },
          orderBy: [{ date: "desc" }, { code: "desc" }],
          take: TAKE,
          select: { id: true, code: true, date: true, concept: true, amount: true, currency: true, supplier: { select: { name: true } } },
        })
      : [],
    modules.payments
      ? db.supplier.findMany({
          where: {
            OR: [
              { nameKey: { contains: key } },
              { contactName: { contains: q, mode: "insensitive" } },
              ...(supplierCode !== null ? [{ code: supplierCode }] : []),
              ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
            ],
          },
          orderBy: [{ isActive: "desc" }, { nameKey: "asc" }],
          take: TAKE,
          select: { id: true, code: true, name: true, contactName: true, isActive: true },
        })
      : [],
  ]);

  const exact = (code: number, wanted: number | null) => (wanted !== null && code === wanted ? 0 : 1);
  return {
    clients: clients
      .sort((a, b) => exact(a.code, clientCode) - exact(b.code, clientCode))
      .slice(0, TAKE)
      .map((c) => ({
        id: c.id,
        title: c.name,
        detail: [formatCode("client", c.code), c.phone && formatPhone(c.phone)].filter(Boolean).join(" · "),
        href: `/clientes/${c.id}`,
      })),
    payments: payments
      .sort((a, b) => exact(a.code, paymentCode) - exact(b.code, paymentCode))
      .map((p) => {
        const day = dbToDay(p.date);
        const ref = formatCode("payment", p.code);
        return {
          id: p.id,
          title: `${p.supplier.name} · ${formatMoney(p.amount, p.currency)}`,
          detail: `${ref} · ${formatDay(day, "d MMM yyyy")} · ${p.concept}`,
          // /pagos ya sabe filtrar por día y por folio: abre la lista con ese pago.
          href: `/pagos?rango=personalizado&desde=${day}&hasta=${day}&q=${ref}`,
        };
      }),
    suppliers: suppliers
      .sort((a, b) => exact(a.code, supplierCode) - exact(b.code, supplierCode))
      .map((s) => ({
        id: s.id,
        title: s.name,
        detail: [formatCode("supplier", s.code), s.contactName, !s.isActive && "desactivado"].filter(Boolean).join(" · "),
        href: `/proveedores/${s.id}`,
      })),
  };
}
