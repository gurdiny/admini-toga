import { describe, expect, it } from "vitest";
import { canAdminister, canCapture, canDelete, canViewTotals } from "./permissions";

const owner = { id: "o", role: "OWNER" as const };
const staff = { id: "s", role: "STAFF" as const };
const mx = (local: string) => new Date(`${local}-06:00`);

describe("permisos", () => {
  it("ambos capturan; solo el dueño ve totales y administra", () => {
    expect(canCapture(staff) && canCapture(owner)).toBe(true);
    expect(canViewTotals(staff)).toBe(false);
    expect(canViewTotals(owner)).toBe(true);
    expect(canAdminister(staff)).toBe(false);
    expect(canAdminister(owner)).toBe(true);
  });

  describe("borrar", () => {
    const now = mx("2026-10-04T23:30:00");

    it("mostrador: lo suyo de hoy sí (aunque en UTC ya sea mañana)", () => {
      expect(canDelete(staff, { createdById: "s", createdAt: mx("2026-10-04T08:00:00") }, now)).toBe(true);
    });

    it("mostrador: lo suyo de ayer no", () => {
      expect(canDelete(staff, { createdById: "s", createdAt: mx("2026-10-03T22:00:00") }, now)).toBe(false);
    });

    it("mostrador: lo de otro usuario no, aunque sea de hoy", () => {
      expect(canDelete(staff, { createdById: "o", createdAt: mx("2026-10-04T09:00:00") }, now)).toBe(false);
    });

    it("dueño: siempre", () => {
      expect(canDelete(owner, { createdById: "s", createdAt: mx("2025-01-01T09:00:00") }, now)).toBe(true);
    });
  });
});
