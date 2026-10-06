// Cada página protegida verifica la sesión POR SÍ MISMA. El layout no basta:
// Next.js renderiza layout y página en paralelo, y si el layout redirige, la
// página igual se ejecuta y su contenido viaja en la respuesta (verificado con
// una cookie inventada contra /admin). Esta prueba falla si una página nueva
// se queda sin su verificación.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const APP = join(__dirname, "(app)");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name === "page.tsx" ? [path] : [];
  });
}

const all = pages(APP).map((path) => ({ path: relative(APP, path), source: readFileSync(path, "utf8") }));

describe("cada página verifica la sesión por sí misma", () => {
  it("encuentra las páginas", () => {
    expect(all.length).toBeGreaterThan(10);
  });

  it.each(all.filter((p) => !p.path.startsWith("admin")).map((p) => [p.path, p.source]))(
    "%s llama a requireUser() o requirePageRole()",
    (_path, source) => {
      expect(source).toMatch(/await requireUser\(\)|await requirePageRole\(/);
    },
  );

  it.each(all.filter((p) => p.path.startsWith("admin")).map((p) => [p.path, p.source]))(
    "%s exige al dueño con requirePageRole(\"OWNER\")",
    (_path, source) => {
      expect(source).toMatch(/await requirePageRole\("OWNER"\)/);
    },
  );
});
