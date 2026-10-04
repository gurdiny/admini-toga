// Descarga de /recordatorios en Excel o CSV con los filtros de la URL de la
// página (?vista=atrasados&todos=1, ?q=…, &formato=csv). No lleva montos: lo
// puede bajar cualquiera que capture. El proxy no protege nada: se verifica aquí.
import type { NextRequest } from "next/server";
import { canCapture } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { exportResponse, parseExportFormat } from "@/lib/export";
import { getSettings } from "@/lib/settings";
import { parseBucket } from "@/modules/reminders/buckets";
import { REMINDER_EXPORT_COLUMNS, remindersFileName, remindersTitle } from "@/modules/reminders/export";
import { getRemindersForExport } from "@/modules/reminders/queries";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Tu sesión expiró. Vuelve a iniciar sesión.", { status: 401 });
  if (!canCapture(user)) return new Response("No tienes permiso para exportar.", { status: 403 });
  if (!(await getSettings()).modules.reminders) return new Response("El módulo de recordatorios está apagado.", { status: 404 });

  const params = request.nextUrl.searchParams;
  const bucket = parseBucket(params.get("vista") ?? undefined);
  const q = (params.get("q") ?? "").trim();
  const allOverdue = bucket === "atrasados" && params.get("todos") === "1";
  const now = new Date();
  const rows = await getRemindersForExport({ bucket, q, allOverdue }, now);

  return exportResponse(parseExportFormat(params.get("formato")), remindersFileName(bucket, q, now), REMINDER_EXPORT_COLUMNS, rows, {
    sheetName: "Recordatorios",
    title: remindersTitle(bucket, q),
  });
}
