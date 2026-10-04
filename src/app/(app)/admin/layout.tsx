import { requirePageRole } from "@/lib/auth/session";

// Solo OWNER. STAFF que entre aquí es redirigido al inicio.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requirePageRole("OWNER");
  return children;
}
