import { describe, expect, it } from "vitest";
import { initials } from "./monogram";

describe("iniciales del monograma", () => {
  it.each([
    ["Platería Taxco Hernández", "PT"],
    ["Soldadura y Pulido Méndez", "SP"],
    ["Cadenas y Eslabones del Centro", "CE"],
    ["Taller de Engaste Ruiz", "TE"],
    ["Ñandú", "Ñ"],
    ["  ", ""],
  ])("%s → %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
