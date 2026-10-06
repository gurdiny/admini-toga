// Solo runtime de Node (lo importa src/instrumentation.ts al arrancar).
// Si faltan variables de entorno, la app se detiene con un mensaje claro en
// los logs del contenedor en vez de fallar a medias con el primer usuario.
import { checkServerEnv } from "@/lib/env";

const result = checkServerEnv();
if (!result.ok) {
  console.error(
    ["", "✗ La app no puede arrancar: revisa las variables de entorno.", ...result.problems.map((p) => `  - ${p}`), ""].join("\n"),
  );
  process.exit(1);
}
