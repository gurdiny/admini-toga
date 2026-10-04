import { requirePageRole } from "@/lib/auth/session";
import { AdminNav } from "@/modules/admin/components/admin-nav";

// Solo OWNER. STAFF que entre aquí es redirigido al inicio. Cada Server
// Action de /admin vuelve a verificar el rol: este layout no es la barrera.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requirePageRole("OWNER");
  return (
    <div className="lg:grid lg:grid-cols-[13rem_1fr] lg:gap-8">
      <aside className="mb-5 lg:mb-0">
        <p className="text-muted-foreground mb-2 hidden text-xs font-bold tracking-wide uppercase lg:block">Administración</p>
        <AdminNav />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
