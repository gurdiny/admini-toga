import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getToday, isDayKey, type DayKey } from "@/lib/date";
import { ACTION_LABELS, ENTITY_LABELS } from "@/modules/admin/audit-format";
import { AdminTable, type AdminColumn } from "@/modules/admin/components/admin-table";
import { AuditFilters } from "@/modules/admin/components/audit-filters";
import { AUDIT_PAGE_SIZE, auditUsers, getAuditLog, type AuditRow } from "@/modules/admin/queries";

export const metadata: Metadata = { title: "Auditoría" };

const ACTION_STYLE: Record<string, string> = {
  CREATE: "bg-toga-green-soft text-toga-green-strong",
  UPDATE: "bg-muted text-foreground",
  DELETE: "bg-destructive/10 text-destructive",
  RESTORE: "bg-toga-pink-soft text-toga-pink-strong",
};

const columns: AdminColumn<AuditRow>[] = [
  {
    header: "Qué pasó",
    mobile: "title",
    cell: (r) => (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className={ACTION_STYLE[r.action]}>
          {ACTION_LABELS[r.action] ?? r.action}
        </Badge>
        <span>
          {ENTITY_LABELS[r.entity] ?? r.entity}: {r.record}
        </span>
      </span>
    ),
  },
  { header: "Quién y cuándo", cell: (r) => `${r.userName} · ${r.when}` },
  {
    header: "Cambios",
    className: "min-w-64",
    cell: (r) =>
      r.lines.length === 0 ? null : (
        <ul className="text-foreground space-y-0.5 text-sm">
          {r.lines.map((line) => (
            <li key={line.field} className="break-words">
              <span className="text-muted-foreground">{line.label}: </span>
              {line.from !== undefined && (
                <>
                  <span className="text-muted-foreground line-through">{line.from}</span> →{" "}
                </>
              )}
              <span className="font-medium">{line.to}</span>
            </li>
          ))}
        </ul>
      ),
  },
];

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AuditPage({ searchParams }: PageProps<"/admin/auditoria">) {
  const params: Params = await searchParams;
  const usuario = one(params.usuario);
  const entidad = one(params.entidad) in ENTITY_LABELS ? one(params.entidad) : "";
  const desde = isDayKey(one(params.desde)) ? (one(params.desde) as DayKey) : "";
  const hasta = isDayKey(one(params.hasta)) ? (one(params.hasta) as DayKey) : "";
  const page = Math.max(1, Number.parseInt(one(params.pagina), 10) || 1);
  const range = desde || hasta ? { from: (desde || "2000-01-01") as DayKey, to: (hasta || getToday()) as DayKey } : undefined;

  const [users, { rows, total }] = await Promise.all([
    auditUsers(),
    getAuditLog({ userId: usuario || undefined, entity: entidad || undefined, range, page }),
  ]);
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const href = (p: number) => {
    const query = new URLSearchParams(Object.entries({ usuario, entidad, desde, hasta }).filter(([, v]) => v));
    if (p > 1) query.set("pagina", String(p));
    return query.size ? `/admin/auditoria?${query}` : "/admin/auditoria";
  };

  return (
    <>
      <PageHeader title="Auditoría" description="Cada alta, cambio, borrado y restauración, con quién y cuándo." />
      <AuditFilters users={users} value={{ usuario, entidad, desde, hasta }} />
      <p className="text-muted-foreground mb-3 text-sm">
        {total} movimiento{total === 1 ? "" : "s"}
        {pages > 1 && ` · página ${page} de ${pages}`}
      </p>
      <AdminTable
        label="Movimientos"
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        empty={{ icon: History, title: "Sin movimientos", description: "Prueba con otros filtros." }}
      />
      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between" aria-label="Páginas">
          <PageButton href={href(page - 1)} disabled={page <= 1}>
            <ChevronLeft aria-hidden /> Anterior
          </PageButton>
          <PageButton href={href(page + 1)} disabled={page >= pages}>
            Siguiente <ChevronRight aria-hidden />
          </PageButton>
        </nav>
      )}
    </>
  );
}

function PageButton({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled)
    return (
      <Button variant="outline" disabled>
        {children}
      </Button>
    );
  return (
    <Button asChild variant="outline">
      <Link href={href}>{children}</Link>
    </Button>
  );
}
