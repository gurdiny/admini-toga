"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/form/money-input";
import { formatMoney, parseMoney, ZERO, type Decimal } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CHARGE_ROWS, type ChargeKey } from "../charges";

/** Lo que se lleva capturado en cada renglón, tal cual sale del campo. */
export type SplitValues = Record<ChargeKey, string>;

type Props = {
  /** Prefijo de los id: "p" en el pago, "d" en la nota, "s" en el alta. */
  idPrefix: string;
  legend: string;
  values: SplitValues;
  currency: string;
  onChange: (key: ChargeKey, value: string) => void;
  /** Saldo que queda en cada renglón de la nota; null en un pago de contado. */
  available?: Record<ChargeKey, Decimal> | null;
  error?: string;
  autoFocus?: boolean;
};

/** "12." o "" mientras se escribe no es un monto: cuenta como cero. */
export function rowAmount(value: string): Decimal {
  return parseMoney(value || "0") ?? ZERO;
}

export function splitTotal(values: SplitValues): Decimal {
  return rowAmount(values.metal).add(rowAmount(values.labor));
}

/**
 * La nota del proveedor partida a la mitad: de un lado el metal, del otro la
 * hechura. Cada lado se captura por separado y abajo se ve el total, que es
 * lo único que se suma en los reportes.
 */
export function SplitAmountFields({
  idPrefix,
  legend,
  values,
  currency,
  onChange,
  available = null,
  error,
  autoFocus,
}: Props) {
  const total = splitTotal(values);

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="bg-card shadow-toga grid grid-cols-2 overflow-hidden rounded-2xl">
        {CHARGE_ROWS.map((row, index) => {
          const id = `${idPrefix}-${row.key}`;
          const left = available?.[row.key] ?? null;
          const over = left !== null && rowAmount(values[row.key]).gt(left);
          return (
            <div key={row.key} className={cn("min-w-0 space-y-1.5 p-3", index > 0 && "border-l")}>
              <Label htmlFor={id} className="truncate text-xs">
                {row.label}
              </Label>
              <MoneyInput
                id={id}
                value={values[row.key]}
                currency={currency}
                onValueChange={(value) => onChange(row.key, value)}
                aria-invalid={over || !!error}
                autoFocus={autoFocus && index === 0}
                className="pr-2"
              />
              {left === null ? (
                <p className="text-muted-foreground line-clamp-2 text-xs">{row.hint}</p>
              ) : over ? (
                <p className="text-destructive text-xs font-bold">
                  Pasa del saldo por {formatMoney(rowAmount(values[row.key]).sub(left), currency)}
                </p>
              ) : (
                <>
                  <p className="text-muted-foreground truncate text-xs tabular-nums">
                    Saldo {formatMoney(left, currency)}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 w-full px-2 text-xs"
                    disabled={left.lte(0)}
                    onClick={() => onChange(row.key, left.toFixed(2))}
                    aria-label={`Liquidar ${row.label.toLowerCase()}: ${formatMoney(left, currency)}`}
                  >
                    {left.lte(0) ? "Liquidado" : "Liquidar"}
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>
      <p className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm">Total</span>
        <strong className="font-heading text-lg tabular-nums">{formatMoney(total, currency)}</strong>
      </p>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
