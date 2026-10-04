import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { devAutoLoginEmail, devLoginUrl } from "@/lib/dev/auto-login";

// Solo es una comodidad: manda a /login a quien no trae cookie de sesión.
// NO es la barrera de seguridad (la cookie podría ser inválida o falsificada,
// y el proxy es evadible, CVE-2025-29927). La verificación real está en
// requireUser()/requireRole() de cada layout y Server Action.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const next = request.nextUrl.pathname + request.nextUrl.search;
    // Solo en `npm run dev` con DEV_AUTO_LOGIN en .env.
    if (devAutoLoginEmail()) {
      return NextResponse.redirect(new URL(devLoginUrl(next), request.url));
    }
    const url = new URL("/login", request.url);
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Todo excepto login, la API de auth, archivos estáticos e imágenes.
    "/((?!login|api/auth|api/dev|api/health|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
