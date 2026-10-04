"use client";

import { forwardRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<typeof Input>, "type" | "onChange" | "value" | "defaultValue"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  currency?: string;
};

function sanitize(raw: string): string {
  // Solo dígitos y un punto decimal con máximo 2 decimales. Las comas se ignoran.
  const cleaned = raw.replace(/[^\d.]/g, "");
  const [int, ...rest] = cleaned.split(".");
  return rest.length ? `${int}.${rest.join("").slice(0, 2)}` : int;
}

function withCommas(value: string): string {
  if (!value) return "";
  const [int, dec] = value.split(".");
  const grouped = int.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec !== undefined ? `${grouped || "0"}.${dec}` : grouped;
}

/**
 * Monto en pesos: nunca acepta letras, máximo 2 decimales, comas de miles al
 * escribir. Teclado numérico en celular. Envía el valor sin comas.
 */
export const MoneyInput = forwardRef<HTMLInputElement, Props>(function MoneyInput(
  { value, defaultValue, onValueChange, currency = "MXN", className, name, ...props },
  ref,
) {
  const [internal, setInternal] = useState(() => sanitize(defaultValue ?? ""));
  const raw = value !== undefined ? sanitize(value) : internal;

  return (
    <div className="relative">
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
        {currency === "MXN" ? "$" : currency}
      </span>
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={withCommas(raw)}
        onChange={(event) => {
          const next = sanitize(event.target.value);
          if (value === undefined) setInternal(next);
          onValueChange?.(next);
        }}
        className={cn("h-11 text-right tabular-nums", currency === "MXN" ? "pl-7" : "pl-12", className)}
        {...props}
      />
      {name && <input type="hidden" name={name} value={raw} />}
    </div>
  );
});
