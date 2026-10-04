// Descarga de /pagos en Excel o CSV con los filtros de la URL de la página
// (?rango=mes&q=…&orden=…&formato=csv). Es un reporte: solo el dueño
// (canViewTotals). El proxy no protege nada: se verifica aquí.
import type { NextRequest } from "next/server";
import { canViewTotals } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { exportResponse, parseExportFormat } from "@/lib/export";
import { getSettings } from "@/lib/settings";
import { PAYMENT_EXPORT_COLUMNS, paymentsFileName, paymentsTitle } from "@/modules/payments/export";
import { parsePaymentFilters } from "@/modules/payments/filters";
import { getPaymentsForExport } from "@/modules/payments/queries";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Tu sesión expiró. Vuelve a iniciar sesión.", { status: 401 });
  if (!canViewTotals(user)) return new Response("Solo el dueño puede exportar los pagos.", { status: 403 });
  if (!(await getSettings()).modules.payments) return new Response("El módulo de pagos está apagado.", { status: 404 });

  const params = request.nextUrl.searchParams;
  const filters = parsePaymentFilters(Object.fromEntries(params));
  const rows = await getPaymentsForExport({ range: filters.range, search: filters.q, sort: filters.orden, dir: filters.dir });

  return exportResponse(parseExportFormat(params.get("formato")), paymentsFileName(filters.range), PAYMENT_EXPORT_COLUMNS, rows, {
    sheetName: "Pagos",
    title: paymentsTitle(filters.range, filters.q),
    totals: ["Monto en pesos"],
  });
}
