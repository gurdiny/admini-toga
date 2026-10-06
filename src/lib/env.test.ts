import { describe, expect, it } from "vitest";
import { checkServerEnv } from "./env";

const good = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://toga:secreto@toga-db:5432/toga",
  BETTER_AUTH_SECRET: "x".repeat(44),
  BETTER_AUTH_URL: "https://admin.toga.mx",
};

describe("variables de entorno", () => {
  it("producción completa: pasa y pone la zona horaria por defecto", () => {
    const result = checkServerEnv(good);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.env.APP_TIMEZONE).toBe("America/Mexico_City");
  });

  it("dice exactamente qué falta", () => {
    const result = checkServerEnv({ NODE_ENV: "production" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.join("\n")).toMatch(/Falta DATABASE_URL/);
      expect(result.problems.join("\n")).toMatch(/Falta BETTER_AUTH_SECRET/);
      expect(result.problems.join("\n")).toMatch(/Falta BETTER_AUTH_URL/);
    }
  });

  it("una variable vacía cuenta como faltante (así llegan desde Easypanel)", () => {
    const result = checkServerEnv({ ...good, BETTER_AUTH_SECRET: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toEqual([expect.stringMatching(/Falta BETTER_AUTH_SECRET/)]);
  });

  it("rechaza un secreto corto y una URL sin https en producción", () => {
    const result = checkServerEnv({ ...good, BETTER_AUTH_SECRET: "corto", BETTER_AUTH_URL: "http://admin.toga.mx" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.join("\n")).toMatch(/muy corta/);
      expect(result.problems.join("\n")).toMatch(/https/);
    }
  });

  it("rechaza una DATABASE_URL que no es de Postgres", () => {
    const result = checkServerEnv({ ...good, DATABASE_URL: "mysql://x" });
    expect(result.ok).toBe(false);
  });

  it("en desarrollo, BETTER_AUTH_URL puede ser http://localhost", () => {
    expect(checkServerEnv({ ...good, NODE_ENV: "development", BETTER_AUTH_URL: "http://localhost:3000" }).ok).toBe(true);
  });
});
