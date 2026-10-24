import { describe, expect, it } from "vitest";
import { chargesLabel, splitLabel } from "./charges";

describe("chargesLabel", () => {
  it("dice las dos cosas cuando cobra ambas", () => {
    expect(chargesLabel({ chargesMetal: true, chargesLabor: true })).toBe("Metal y mano de obra");
  });

  it("dice solo metal cuando únicamente entrega plata", () => {
    expect(chargesLabel({ chargesMetal: true, chargesLabor: false })).toBe("Metal");
  });

  it("dice solo mano de obra para un engastador", () => {
    expect(chargesLabel({ chargesMetal: false, chargesLabor: true })).toBe("Mano de obra");
  });

  it("no deja la etiqueta vacía aunque llegue sin nada marcado", () => {
    expect(chargesLabel({ chargesMetal: false, chargesLabor: false })).toBe("Sin definir");
  });
});

describe("splitLabel", () => {
  it("dice los dos montos cuando el pago se repartió", () => {
    expect(splitLabel({ metal: "5000.00", labor: "1000.00" })).toBe("Metal $5,000.00 · Mano de obra $1,000.00");
  });

  it("solo nombra el renglón cuando todo fue de uno", () => {
    expect(splitLabel({ metal: "0.00", labor: "640.00" })).toBe("Mano de obra");
    expect(splitLabel({ metal: "950.00", labor: "0.00" })).toBe("Metal");
  });

  it("respeta la moneda del movimiento", () => {
    // Intl separa el código de moneda con un espacio duro (U+00A0).
    const label = splitLabel({ metal: "100.00", labor: "50.00" }, "USD").replace(/\u00a0/g, " ");
    expect(label).toBe("Metal USD 100.00 · Mano de obra USD 50.00");
  });
});
