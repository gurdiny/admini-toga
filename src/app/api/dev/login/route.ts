// SOLO DESARROLLO: inicia sesión con los usuarios del seed sin escribir la
// contraseña. Pasa por el login real de Better Auth (misma cookie, misma
// sesión en la base); solo se salta el formulario.
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { DEV_PASSWORD, devAutoLoginEmail, isDevelopment } from "@/lib/dev/auto-login";

function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function GET(request: NextRequest) {
  if (!isDevelopment()) return new NextResponse(null, { status: 404 });

  const params = request.nextUrl.searchParams;
  const email = params.get("as") ?? devAutoLoginEmail();
  const next = safeNext(params.get("next"));
  if (!email) return NextResponse.redirect(new URL("/login?salir=1", request.url));

  const signIn = await auth.api.signInEmail({
    body: { email, password: DEV_PASSWORD, rememberMe: true },
    headers: request.headers,
    asResponse: true,
  });

  if (!signIn.ok) {
    // Sin esto, el proxy volvería a mandar aquí: se corta el ciclo en /login.
    const url = new URL("/login", request.url);
    url.searchParams.set("salir", "1");
    url.searchParams.set("dev_error", email);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  for (const cookie of signIn.headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
