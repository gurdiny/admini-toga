// Los dos renglones de la nota de un proveedor: el metal (la plata que
// entrega) y la hechura (engaste, soldadura, pulido, grabado). Cada nota
// (`SupplierDebt`) lleva un monto en cada renglón y cada pago se reparte
// entre los dos, así que ninguna mitad paga la otra.
//
// Las casillas del proveedor (`chargesMetal`, `chargesLabor`) solo dicen qué
// se le suele pagar: sirven de etiqueta y para proponer el renglón al
// capturar. Toda nota puede llevar los dos lados, aunque uno quede en cero.

import { formatMoney } from "@/lib/money";

export type SupplierCharges = { chargesMetal: boolean; chargesLabor: boolean };

/** Llave de un renglón. Los campos en la base son `amountMetal`/`amountLabor`. */
export type ChargeKey = "metal" | "labor";

export const METAL_LABEL = "Metal";
export const LABOR_LABEL = "Mano de obra";

/** Los dos renglones, siempre en este orden: metal a la izquierda. */
export const CHARGE_ROWS = [
  { key: "metal", label: METAL_LABEL, field: "amountMetal", hint: "La plata que te entrega" },
  { key: "labor", label: LABOR_LABEL, field: "amountLabor", hint: "Engaste, soldadura, pulido, grabado" },
] as const satisfies readonly { key: ChargeKey; label: string; field: string; hint: string }[];

export const CHARGE_LABELS: Record<ChargeKey, string> = { metal: METAL_LABEL, labor: LABOR_LABEL };

/** Etiqueta para la lista y la ficha: «Metal y mano de obra», «Metal», «Mano de obra». */
export function chargesLabel({ chargesMetal, chargesLabor }: SupplierCharges): string {
  if (chargesMetal && chargesLabor) return "Metal y mano de obra";
  if (chargesMetal) return METAL_LABEL;
  if (chargesLabor) return LABOR_LABEL;
  // No debería pasar (lo impide el CHECK), pero la UI nunca se queda en blanco.
  return "Sin definir";
}

/** Mensaje de validación cuando no se marcó ninguna casilla. */
export const CHARGES_REQUIRED_MESSAGE = "Marca al menos una: metal o mano de obra.";

/** Mensaje cuando los dos renglones de una nota o de un pago quedaron en cero. */
export const SPLIT_REQUIRED_MESSAGE = "Escribe cuánto es de metal, cuánto de mano de obra, o las dos cosas.";

/**
 * Cómo se repartió un movimiento, en corto: «Metal $5,000.00 · Mano de obra
 * $1,000.00» cuando lleva los dos renglones, o solo el nombre del renglón
 * cuando fue de uno solo (el monto ya se ve al lado).
 */
export function splitLabel(split: { metal: string; labor: string }, currency = "MXN"): string {
  const hasMetal = Number(split.metal) > 0;
  const hasLabor = Number(split.labor) > 0;
  if (hasMetal && hasLabor) {
    return `${METAL_LABEL} ${formatMoney(split.metal, currency)} · ${LABOR_LABEL} ${formatMoney(split.labor, currency)}`;
  }
  return hasLabor ? LABOR_LABEL : METAL_LABEL;
}
