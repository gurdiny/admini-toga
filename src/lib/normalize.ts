// Normalización de texto capturado a mano. Se usa para las llaves únicas
// (nameKey, teléfono) y así evitar duplicados por mayúsculas,
// acentos o espacios.

/** "  José   PÉREZ " → "jose perez" */
export function toNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Limpia espacios repetidos para mostrar: "  José   Pérez " → "José Pérez" */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/**
 * Deja solo los 10 dígitos de un teléfono de México.
 * Acepta "(55) 1234-5678", "+52 55 1234 5678", "5215512345678".
 * Devuelve null si no quedan exactamente 10 dígitos.
 */
export function normalizePhoneMX(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("521")) digits = digits.slice(3);
  if (digits.length === 12 && digits.startsWith("52")) digits = digits.slice(2);
  return digits.length === 10 ? digits : null;
}
