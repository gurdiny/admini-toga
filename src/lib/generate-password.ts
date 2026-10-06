import { randomInt } from "node:crypto";

// Sin letras ni números que se confunden al copiarlos a mano (l/1, o/0) y solo
// minúsculas: se escribe fácil en el teclado del iPhone.
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/**
 * Contraseña aleatoria en grupos: «k7mq2-xw9pd-4hn3r-tz8ve» (4 × 5 caracteres
 * de 32 posibles = 100 bits). Usa el generador criptográfico de Node.
 */
export function generatePassword(groups = 4, size = 5): string {
  return Array.from({ length: groups }, () => Array.from({ length: size }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")).join("-");
}
