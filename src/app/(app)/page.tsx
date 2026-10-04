import { requireUser } from "@/lib/auth/session";

// Provisional: el dashboard real llega en la Fase 7.
export default async function Home() {
  const user = await requireUser();
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Hola, {user.name}</h1>
      <p className="text-muted-foreground">
        Los módulos de pagos y recordatorios llegan en las siguientes fases.
      </p>
    </div>
  );
}
