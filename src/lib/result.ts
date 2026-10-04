// Toda Server Action devuelve Result<T>: el cliente nunca recibe una
// excepción, recibe { ok: false, error } con un mensaje en español.

export type Result<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok(): Result<void>;
export function ok<T>(data: T): Result<T>;
export function ok<T>(data?: T): Result<T | undefined> {
  return { ok: true, data };
}

export function fail(error: string, fieldErrors?: Record<string, string>): Result<never> {
  return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error };
}
