// Límite de intentos fallidos de login. Hace falta aquí y no en Better Auth:
// su limitador solo actúa en las peticiones HTTP a /api/auth/*, y el login de
// la app es una Server Action que llama a auth.api.signInEmail() directamente.
//
// - Por correo: frena adivinar la contraseña de una cuenta, aunque se cambie de IP.
// - Por IP: frena probar muchos correos desde el mismo lugar.
// Vive en memoria: la app corre en un solo contenedor. Al reiniciar se limpia.

export type ThrottleRule = { max: number; windowMs: number; lockMs: number };

const MINUTE = 60_000;
export const EMAIL_RULE: ThrottleRule = { max: 5, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE };
export const IP_RULE: ThrottleRule = { max: 20, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE };
const MAX_ENTRIES = 10_000;

type Entry = { failures: number; firstAt: number; lockedUntil: number };

export class LoginThrottle {
  private entries = new Map<string, Entry>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly rules = { email: EMAIL_RULE, ip: IP_RULE },
  ) {}

  /** Minutos que faltan si está bloqueado (por correo o por IP); null si puede intentar. */
  blockedFor(email: string, ip: string): number | null {
    const now = this.now();
    const until = Math.max(this.lockedUntil(`email:${email}`, now), this.lockedUntil(`ip:${ip}`, now));
    return until > now ? Math.ceil((until - now) / MINUTE) : null;
  }

  fail(email: string, ip: string) {
    const now = this.now();
    this.prune(now);
    this.count(`email:${email}`, this.rules.email, now);
    this.count(`ip:${ip}`, this.rules.ip, now);
  }

  /** Entró bien: se olvidan los fallos de ese correo (los de la IP siguen). */
  succeed(email: string) {
    this.entries.delete(`email:${email}`);
  }

  private lockedUntil(key: string, now: number): number {
    const entry = this.entries.get(key);
    return entry && entry.lockedUntil > now ? entry.lockedUntil : 0;
  }

  private count(key: string, rule: ThrottleRule, now: number) {
    let entry = this.entries.get(key);
    if (!entry || now - entry.firstAt > rule.windowMs) entry = { failures: 0, firstAt: now, lockedUntil: 0 };
    entry.failures += 1;
    if (entry.failures >= rule.max) {
      entry.lockedUntil = now + rule.lockMs;
      // Al terminar el bloqueo vuelve a contar desde cero.
      entry.failures = 0;
      entry.firstAt = entry.lockedUntil;
    }
    this.entries.set(key, entry);
  }

  /** Que un ataque con muchos correos/IP distintos no llene la memoria. */
  private prune(now: number) {
    if (this.entries.size < MAX_ENTRIES) return;
    const horizon = Math.max(EMAIL_RULE.windowMs, IP_RULE.windowMs);
    for (const [key, entry] of this.entries) {
      if (entry.lockedUntil <= now && now - entry.firstAt > horizon) this.entries.delete(key);
    }
    // Si aún está lleno, se van los más viejos.
    for (const key of this.entries.keys()) {
      if (this.entries.size < MAX_ENTRIES) break;
      this.entries.delete(key);
    }
  }
}

/**
 * IP del cliente detrás de Traefik: el último valor de X-Forwarded-For es el
 * que agregó Traefik con la conexión real (los anteriores los puede inventar
 * el cliente). Sin proxy (desarrollo), "local".
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").map((part) => part.trim()).filter(Boolean).pop();
  return last || headers.get("x-real-ip") || "local";
}

/** Una instancia por proceso (sobrevive al hot reload de desarrollo). */
const globalForThrottle = globalThis as unknown as { loginThrottle?: LoginThrottle };
export const loginThrottle = (globalForThrottle.loginThrottle ??= new LoginThrottle());
