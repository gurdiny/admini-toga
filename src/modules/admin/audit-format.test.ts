import { describe, expect, it } from "vitest";
import { describeChanges, formatValue, referencedIds } from "./audit-format";

describe("auditoría legible", () => {
  it("UPDATE: solo lo que cambió, en español y con formato", () => {
    const lines = describeChanges(
      "UPDATE",
      {
        amount: { from: "1200.00", to: "1250.00" },
        date: { from: "2026-10-03T00:00:00.000Z", to: "2026-10-04T00:00:00.000Z" },
        paymentMethod: { from: "EFECTIVO", to: "TRANSFERENCIA" },
        categoryId: { from: "c1", to: "c2" },
      },
      { c1: "Anillos", c2: "Cadenas" },
    );
    expect(lines).toEqual([
      { field: "amount", label: "Monto", from: "$1,200.00", to: "$1,250.00" },
      { field: "date", label: "Fecha", from: "3 oct 2026", to: "4 oct 2026" },
      { field: "paymentMethod", label: "Método de pago", from: "Efectivo", to: "Transferencia" },
      { field: "categoryId", label: "Categoría", from: "Anillos", to: "Cadenas" },
    ]);
  });

  it("CREATE: datos con que se creó, sin campos internos ni vacíos", () => {
    const lines = describeChanges("CREATE", {
      after: { id: "x", nameKey: "lucia", name: "Lucía", phone: null, createdById: "u1", isActive: true },
    });
    expect(lines).toEqual([
      { field: "name", label: "Nombre", to: "Lucía" },
      { field: "isActive", label: "Activo", to: "Sí" },
    ]);
  });

  it("la contraseña nunca muestra el hash: solo que cambió", () => {
    expect(describeChanges("UPDATE", { password: { from: "anterior", to: "cambiada" } })).toEqual([
      { field: "password", label: "Contraseña", from: "anterior", to: "cambiada" },
    ]);
  });

  it("DELETE no lista campos", () => {
    expect(describeChanges("DELETE", { before: { name: "X" } })).toEqual([]);
  });

  it("ids sin nombre conocido no se muestran crudos", () => {
    expect(formatValue("clientId", "cm123")).toBe("(otro registro)");
    expect(formatValue("deletedAt", null)).toBe("—");
  });

  it("encuentra los ids relacionados para resolver sus nombres", () => {
    expect(referencedIds({ categoryId: { from: "c1", to: "c2" }, after: { supplierId: "s1", name: "x" } }).sort()).toEqual(["c1", "c2", "s1"]);
  });
});
