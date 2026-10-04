// Códigos visibles de los registros: PROV-0001, ADE-0001, PAG-0001.
// El número es la columna `code` (autoincremental); el id interno no se muestra.

export const CODE_PREFIX = {
  supplier: "PROV",
  debt: "ADE",
  payment: "PAG",
} as const;

export type CodeKind = keyof typeof CODE_PREFIX;

export function formatCode(kind: CodeKind, code: number): string {
  return `${CODE_PREFIX[kind]}-${String(code).padStart(4, "0")}`;
}

/**
 * Si el texto buscado es un código ("PAG-12", "pag12", "ADE-0003") devuelve
 * su número; si es solo un número ("12") también. Si no, null.
 */
export function parseCode(query: string, kind: CodeKind): number | null {
  const match = query.trim().match(new RegExp(`^(?:${CODE_PREFIX[kind]}-?)?0*(\\d{1,9})$`, "i"));
  return match ? Number(match[1]) : null;
}
