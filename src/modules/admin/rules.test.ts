import { describe, expect, it } from "vitest";
import { leavesNoActiveOwner, suggestPassword } from "./rules";

const owner = { id: "o1", role: "OWNER" as const, isActive: true };
const staff = { id: "s1", role: "STAFF" as const, isActive: true };

describe("nunca sin dueño activo", () => {
  it("no se puede bajar de rol ni desactivar al único dueño", () => {
    expect(leavesNoActiveOwner([owner, staff], { id: "o1", role: "STAFF" })).toBe(true);
    expect(leavesNoActiveOwner([owner, staff], { id: "o1", isActive: false })).toBe(true);
  });

  it("con otro dueño activo sí se puede", () => {
    const owner2 = { id: "o2", role: "OWNER" as const, isActive: true };
    expect(leavesNoActiveOwner([owner, owner2, staff], { id: "o1", isActive: false })).toBe(false);
  });

  it("un segundo dueño desactivado no cuenta", () => {
    const inactiveOwner = { id: "o2", role: "OWNER" as const, isActive: false };
    expect(leavesNoActiveOwner([owner, inactiveOwner], { id: "o1", role: "STAFF" })).toBe(true);
  });

  it("cambios al mostrador no afectan", () => {
    expect(leavesNoActiveOwner([owner, staff], { id: "s1", isActive: false })).toBe(false);
  });
});

describe("contraseña sugerida", () => {
  it("palabra-4 dígitos-palabra, al menos 8 caracteres", () => {
    const password = suggestPassword();
    expect(password).toMatch(/^[a-z]+-\d{4}-[a-z]+$/);
    expect(password.length).toBeGreaterThanOrEqual(8);
  });
});
