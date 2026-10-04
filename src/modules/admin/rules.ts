// Reglas de usuarios sin dependencias de servidor (se prueban con Vitest).

import type { Role } from "@/generated/prisma/browser";

type UserState = { id: string; role: Role; isActive: boolean };

/**
 * ¿El cambio deja al negocio sin ningún dueño activo? Nunca se permite:
 * nadie podría entrar a /admin para arreglarlo.
 */
export function leavesNoActiveOwner(users: UserState[], change: { id: string; role?: Role; isActive?: boolean }): boolean {
  const after = users.map((u) => (u.id === change.id ? { ...u, ...change } : u));
  return !after.some((u) => u.role === "OWNER" && u.isActive);
}

/** Contraseña fácil de dictar en el mostrador: "plata-4821-anillo". */
export function suggestPassword(random: () => number = Math.random): string {
  const words = ["plata", "anillo", "arete", "dije", "cadena", "pulsera", "broche", "perla", "taller", "toga"];
  const pick = () => words[Math.floor(random() * words.length)];
  const digits = String(Math.floor(random() * 9000) + 1000);
  return `${pick()}-${digits}-${pick()}`;
}
