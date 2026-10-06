import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("a dónde regresar después del login", () => {
  it("rutas internas se conservan, con su búsqueda", () => {
    expect(safeNextPath("/pagos?rango=mes&q=PAG-0001")).toBe("/pagos?rango=mes&q=PAG-0001");
    expect(safeNextPath("/clientes/abc#pedidos")).toBe("/clientes/abc#pedidos");
  });

  it("vacío o relativo → inicio", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath("pagos")).toBe("/");
  });

  it.each([
    "//evil.com",
    "/\\evil.com",
    "/\\/evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "https://evil.com",
    "javascript:alert(1)",
  ])("no deja salir del sitio: %j", (next) => {
    const result = safeNextPath(next);
    expect(new URL(result, "https://admin.toga.mx").origin).toBe("https://admin.toga.mx");
  });
});
