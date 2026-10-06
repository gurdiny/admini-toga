import { redirect } from "next/navigation";
import { requirePageRole } from "@/lib/auth/session";

// El historial del cliente vive en /clientes/[id] (lo ve también el mostrador);
// ahí mismo el dueño tiene Editar y Fusionar.
export default async function AdminClientPage({ params }: PageProps<"/admin/clientes/[id]">) {
  // Cada página verifica por su cuenta: el layout de /admin no basta (Next
  // renderiza layout y página en paralelo, y la página se enviaría igual).
  await requirePageRole("OWNER");
  redirect(`/clientes/${(await params).id}`);
}
