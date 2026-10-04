import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Gem } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Gem className="size-8" aria-hidden />
          <h1 className="text-xl font-semibold">Sistema de Joyería</h1>
          <p className="text-muted-foreground text-sm">Entra con tu correo y contraseña.</p>
        </div>
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </div>
    </main>
  );
}
