import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TogaLogo } from "@/components/brand/toga-logo";
import { getCurrentUser } from "@/lib/auth/session";
import { DevLoginShortcuts } from "@/lib/dev/dev-login-shortcuts";
import { devAutoLoginEmail, devLoginUrl } from "@/lib/dev/auto-login";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, salir, dev_error } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  if (await getCurrentUser()) redirect("/");
  // Desarrollo: la cookie existía pero la sesión no (p. ej. base reiniciada).
  if (devAutoLoginEmail() && !salir) redirect(devLoginUrl(nextPath ?? "/"));

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <TogaLogo priority className="h-auto w-48" />
          <div className="space-y-1">
            <h1 className="text-lg font-bold">Control interno</h1>
            <p className="text-muted-foreground text-sm">Entra con tu correo y contraseña.</p>
          </div>
        </div>
        <LoginForm next={nextPath} />
        <DevLoginShortcuts next={nextPath} error={typeof dev_error === "string" ? dev_error : undefined} />
      </div>
    </main>
  );
}
