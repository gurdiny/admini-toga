// A dónde mandar después del login (?next=…): solo rutas de esta misma app.
// Se decide con el mismo parser de URLs que usa el navegador: revisar el texto
// a mano no basta, porque "/\evil.com" o "/<tab>/evil.com" el navegador los
// convierte en "//evil.com" y saldría del sitio (redirect abierto).
const BASE = "http://toga.invalid";

export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  try {
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
