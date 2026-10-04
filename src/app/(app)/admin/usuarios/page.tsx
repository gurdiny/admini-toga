import type { Metadata } from "next";
import { UserCog } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/session";
import { AdminTable, type AdminColumn } from "@/modules/admin/components/admin-table";
import { NewUserButton, RoleBadgeText, UserRowActions } from "@/modules/admin/components/user-actions";
import { listUsers, type UserRow } from "@/modules/admin/queries";

export const metadata: Metadata = { title: "Usuarios" };

export default async function UsersPage() {
  const [me, users] = await Promise.all([requireUser(), listUsers()]);

  const columns: AdminColumn<UserRow>[] = [
    {
      header: "Nombre",
      mobile: "title",
      cell: (u) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          {u.name}
          {u.id === me.id && <span className="text-muted-foreground text-xs font-normal">(tú)</span>}
          <Badge variant="secondary" className={u.role === "OWNER" ? "bg-toga-green-soft text-toga-green-strong" : undefined}>
            <RoleBadgeText role={u.role} />
          </Badge>
          {!u.isActive && <Badge variant="outline">Desactivado</Badge>}
        </span>
      ),
    },
    { header: "Correo", cell: (u) => <span className="break-all">{u.email}</span> },
    // Sale de sus sesiones: desactivar o cambiar la contraseña las cierra.
    { header: "Sesión", cell: (u) => (u.lastSeen ? `Activo por última vez ${u.lastSeen}` : "Sin sesión abierta") },
  ];

  return (
    <>
      <PageHeader title="Usuarios" description="Quién puede entrar y qué puede hacer." actions={<NewUserButton />} />
      <AdminTable
        label="Usuarios"
        rows={users}
        rowKey={(u) => u.id}
        columns={columns}
        muted={(u) => !u.isActive}
        actions={(u) => <UserRowActions user={u} isSelf={u.id === me.id} />}
        empty={{ icon: UserCog, title: "Sin usuarios" }}
      />
    </>
  );
}
