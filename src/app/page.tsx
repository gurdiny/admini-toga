import { Gem } from "lucide-react";
import { Button } from "@/components/ui/button";

// Pantalla provisional de la Fase 0. El dashboard real llega en la Fase 7.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <Gem className="size-10" aria-hidden />
      <h1 className="text-2xl font-semibold">Sistema de Joyería</h1>
      <p className="text-muted-foreground max-w-sm">
        Infraestructura lista. Los módulos de pagos y recordatorios llegan en
        las siguientes fases.
      </p>
      <Button disabled>Próximamente</Button>
    </main>
  );
}
