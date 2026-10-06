"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { login } from "@/lib/auth/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Card>
      <CardContent>
        <form action={action} className="space-y-4">
          {next && <input type="hidden" name="next" value={next} />}

          {state?.error && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              required
              defaultValue={state?.email}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                className="h-11 pr-12"
              />
              {/* En el teclado del iPhone es fácil equivocarse: poder ver lo escrito evita intentos fallidos. */}
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar" : "Mostrar"}
                aria-pressed={showPassword}
                aria-controls="password"
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-full"
              >
                {showPassword ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
              </button>
            </div>
          </div>

          <Button type="submit" variant="brand" size="lg" className="w-full" disabled={pending}>
            {pending ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
