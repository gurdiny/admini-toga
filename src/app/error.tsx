"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import { TogaLogo } from "@/components/brand/toga-logo";
import { Button } from "@/components/ui/button";

/**
 * Error inesperado en una página (la base no responde, un fallo del servidor…).
 * Se queda dentro del layout raíz: fuentes y estilos de TOGA siguen cargados.
 * En producción Next.js no manda el mensaje real al navegador, solo el `digest`
 * que aparece en los logs del contenedor.
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <TogaLogo className="h-auto w-40" />
        <div className="space-y-2">
          <h1 className="text-xl font-bold">Algo salió mal</h1>
          <p className="text-muted-foreground text-sm">
            No se pudo cargar esta pantalla. Intenta de nuevo; si sigue fallando, avísale al dueño.
          </p>
          {error.digest && <p className="text-muted-foreground text-xs">Código: {error.digest}</p>}
        </div>
        <div className="flex w-full flex-col gap-2">
          <Button type="button" variant="brand" size="lg" className="w-full" onClick={() => retry()}>
            <RotateCw aria-hidden /> Intentar de nuevo
          </Button>
          <Button asChild variant="ghost" size="lg" className="w-full">
            <Link href="/">Regresar al inicio</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
