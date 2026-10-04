import { describe, expect, it } from "vitest";
import { DEFAULT_READY_MESSAGE, readyMessage, readyWhatsAppUrl } from "./whatsapp";

const client = { name: "  Gerardo   Urias ", code: 5, phone: "9215859622" };

describe("aviso de pedido listo", () => {
  it("usa el primer nombre, el negocio y el folio; nunca la nota", () => {
    expect(readyMessage(DEFAULT_READY_MESSAGE, client, "TOGA")).toBe(
      "Hola Gerardo, te escribimos de TOGA. Tu pedido ya está listo y puedes pasar a recogerlo cuando gustes. Tu folio es CLI-0005. ¡Gracias!",
    );
  });

  it("arma el enlace de WhatsApp con el texto codificado", () => {
    const url = readyWhatsAppUrl("Hola {cliente} & {folio}", client, "TOGA");
    expect(url).toBe("https://wa.me/529215859622?text=Hola%20Gerardo%20%26%20CLI-0005");
  });

  it("sin teléfono no hay enlace", () => {
    expect(readyWhatsAppUrl(DEFAULT_READY_MESSAGE, { ...client, phone: null }, "TOGA")).toBeNull();
  });
});
