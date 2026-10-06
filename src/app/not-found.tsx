import type { Metadata } from "next";
import Link from "next/link";
import { TogaLogo } from "@/components/brand/toga-logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "No encontrado" };

/** 404 de toda la app (enlaces viejos, un folio que ya no existe…). */
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <TogaLogo className="h-auto w-40" />
        <div className="space-y-2">
          <p className="text-toga-pink-strong text-sm font-bold">Error 404</p>
          <h1 className="text-xl font-bold">No encontramos esta página</h1>
          <p className="text-muted-foreground text-sm">Puede que el enlace esté mal escrito o que el registro ya no exista.</p>
        </div>
        <Button asChild variant="brand" size="lg" className="w-full">
          <Link href="/">Regresar al inicio</Link>
        </Button>
      </div>
    </main>
  );
}
