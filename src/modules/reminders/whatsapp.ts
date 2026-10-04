// Aviso por WhatsApp de que el pedido ya está listo. Sin dependencias de
// servidor: la URL se arma en el servidor y se pasa ya lista a la tarjeta.

import { formatCode } from "@/lib/codes";

/**
 * Plantilla por defecto (AppSetting `readyMessage`, editable en Fase 6).
 * Variables: {cliente} (primer nombre), {negocio}, {folio}.
 * Nunca incluye la nota del pedido: es interna del taller.
 */
export const DEFAULT_READY_MESSAGE =
  "Hola {cliente}, te escribimos de {negocio}. Tu pedido ya está listo y puedes pasar a recogerlo cuando gustes. Tu folio es {folio}. ¡Gracias!";

type Client = { name: string; code: number; phone: string | null };

export function readyMessage(template: string, client: Client, business: string): string {
  const firstName = client.name.trim().split(/\s+/)[0] ?? client.name;
  return template
    .replaceAll("{cliente}", firstName)
    .replaceAll("{negocio}", business)
    .replaceAll("{folio}", formatCode("client", client.code));
}

/** https://wa.me/52XXXXXXXXXX?text=… o null si el cliente no tiene teléfono. */
export function readyWhatsAppUrl(template: string, client: Client, business: string): string | null {
  if (!client.phone) return null;
  return `https://wa.me/52${client.phone}?text=${encodeURIComponent(readyMessage(template, client, business))}`;
}
