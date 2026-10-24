import { describe, expect, it } from "vitest";
import { plural } from "./text";

describe("plural", () => {
  it("usa el singular solo con uno", () => {
    expect(plural(1, "nota", "notas")).toBe("1 nota");
    expect(plural(2, "nota", "notas")).toBe("2 notas");
  });

  it("cero va en plural, como se dice en español", () => {
    expect(plural(0, "pago", "pagos")).toBe("0 pagos");
  });
});
