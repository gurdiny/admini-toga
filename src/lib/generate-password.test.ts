import { describe, expect, it } from "vitest";
import { generatePassword } from "./generate-password";

describe("contraseña generada", () => {
  it("4 grupos de 5, solo minúsculas y números sin l/1/o/0", () => {
    expect(generatePassword()).toMatch(/^[a-km-np-z2-9]{5}(-[a-km-np-z2-9]{5}){3}$/);
  });

  it("no se repite", () => {
    const passwords = new Set(Array.from({ length: 1000 }, () => generatePassword()));
    expect(passwords.size).toBe(1000);
  });

  it("cumple el mínimo de 8 caracteres de Better Auth", () => {
    expect(generatePassword().length).toBeGreaterThanOrEqual(8);
  });
});
