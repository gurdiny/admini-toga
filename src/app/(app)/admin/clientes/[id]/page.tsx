import { redirect } from "next/navigation";

// El historial del cliente vive en /clientes/[id] (lo ve también el mostrador);
// ahí mismo el dueño tiene Editar y Fusionar.
export default async function AdminClientPage({ params }: PageProps<"/admin/clientes/[id]">) {
  redirect(`/clientes/${(await params).id}`);
}
