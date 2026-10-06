// Variables de entorno del servidor, validadas al arrancar (src/instrumentation.ts).
// Si falta algo, la app no arranca y dice qué falta, en vez de romperse a
// medias en el primer login o la primera consulta.
import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z
    .string({ error: "Falta DATABASE_URL (conexión a Postgres)." })
    .regex(/^postgres(ql)?:\/\/.+/, "DATABASE_URL debe empezar con postgresql://"),
  BETTER_AUTH_SECRET: z
    .string({ error: "Falta BETTER_AUTH_SECRET (genérala con: openssl rand -base64 32)." })
    .min(32, "BETTER_AUTH_SECRET es muy corta: usa al menos 32 caracteres (openssl rand -base64 32)."),
  BETTER_AUTH_URL: z
    .url({ error: "BETTER_AUTH_URL debe ser la dirección completa de la app, p. ej. https://admin.toga.mx" })
    .optional(),
  APP_TIMEZONE: z.string().default("America/Mexico_City"),
});

/**
 * En producción la URL es obligatoria y con HTTPS (las cookies de sesión son
 * seguras). Va aparte del esquema para avisar junto con lo demás que falte.
 */
function productionProblems(source: Record<string, string>): string[] {
  if (source.NODE_ENV !== "production") return [];
  const url = source.BETTER_AUTH_URL;
  if (!url) return ["Falta BETTER_AUTH_URL (p. ej. https://admin.toga.mx)."];
  if (!url.startsWith("https://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url)) {
    return ["BETTER_AUTH_URL debe usar https:// en producción."];
  }
  return [];
}

export type ServerEnv = z.output<typeof serverEnvSchema>;

/** Variables vacías ("") cuentan como faltantes: así llegan desde algunos paneles. */
function withoutEmpty(source: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1].trim() !== ""),
  );
}

/** Valida las variables; devuelve los datos o la lista de problemas en español. */
export function checkServerEnv(
  source: Record<string, string | undefined> = process.env,
): { ok: true; env: ServerEnv } | { ok: false; problems: string[] } {
  const values = withoutEmpty(source);
  const result = serverEnvSchema.safeParse(values);
  const problems = [...(result.success ? [] : result.error.issues.map((issue) => issue.message)), ...productionProblems(values)];
  if (result.success && problems.length === 0) return { ok: true, env: result.data };
  return { ok: false, problems };
}
