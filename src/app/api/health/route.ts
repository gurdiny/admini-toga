// Estado de la app para el healthcheck del contenedor y para revisar a mano
// (curl https://admin.toga.mx/api/health). Público a propósito: no expone datos,
// solo si la app responde y alcanza la base. El detalle del error va a los logs.
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json(
      { status: "ok", db: "ok", ms: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[health] La base de datos no responde:", error);
    return Response.json({ status: "error", db: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
