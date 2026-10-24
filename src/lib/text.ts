// Textos que cuentan cosas. En español se lee mucho mejor «1 nota y 3 pagos»
// que «1 nota(s) y 3 pago(s)», y estos mensajes salen en diálogos de borrado.

/** `plural(1, "nota", "notas")` → "1 nota"; `plural(3, …)` → "3 notas". */
export function plural(count: number, singular: string, many: string): string {
  return `${count} ${count === 1 ? singular : many}`;
}
