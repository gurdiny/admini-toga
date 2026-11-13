// Descarga de /pagos en Excel o CSV con los filtros de la URL de la página
// (?ver=todos&rango=mes&q=…&orden=…&formato=csv). `ver` elige la lista: a
// proveedores (sin parámetro), sin proveedor o todos. Es un reporte: solo el dueño
// (canViewTotals). El proxy no protege nada: se verifica aquí.
import type { NextRequest } from "next/server";
import { canViewTotals } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { exportResponse, parseExportFormat } from "@/lib/export";
import { getSettings } from "@/lib/settings";
import {
  ALL_PAYMENTS_EXPORT_COLUMNS,
  OTHER_PAYMENT_EXPORT_COLUMNS,
  PAYMENT_EXPORT_COLUMNS,
  paymentsFileName,
  paymentsTitle,
} from "@/modules/payments/export";
import { parsePaymentFilters } from "@/modules/payments/filters";
import { getAllPaymentsForExport, getOtherPaymentsForExport, getPaymentsForExport } from "@/modules/payments/queries";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Tu sesión expiró. Vuelve a iniciar sesión.", { status: 401 });
  if (!canViewTotals(user)) return new Response("Solo el dueño puede exportar los pagos.", { status: 403 });
  if (!(await getSettings()).modules.payments) return new Response("El módulo de pagos está apagado.", { status: 404 });

  const params = request.nextUrl.searchParams;
  const filters = parsePaymentFilters(Object.fromEntries(params));
  const format = parseExportFormat(params.get("formato"));
  const query = { range: filters.range, search: filters.q, sort: filters.orden, dir: filters.dir };
  const file = paymentsFileName(filters.range, filters.ver);
  const options = { sheetName: "Pagos", title: paymentsTitle(filters.range, filters.q, filters.ver), totals: ["Monto en pesos"] };

  if (filters.ver === "sin-proveedor") {
    return exportResponse(format, file, OTHER_PAYMENT_EXPORT_COLUMNS, await getOtherPaymentsForExport(query), options);
  }
  if (filters.ver === "todos") {
    return exportResponse(format, file, ALL_PAYMENTS_EXPORT_COLUMNS, await getAllPaymentsForExport(query), options);
  }
  return exportResponse(format, file, PAYMENT_EXPORT_COLUMNS, await getPaymentsForExport(query), options);
}
