"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DayInput } from "@/components/form/day-input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { paymentsHref, type PaymentPageFilters } from "../filters";

const PRESETS = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mes" },
] as const;

/** Selector rápido de periodo. Cambia la URL: el filtro sobrevive a recargar. */
export function RangePicker({ filters }: { filters: PaymentPageFilters }) {
  const router = useRouter();
  const [custom, setCustom] = useState(filters.rango === "personalizado");
  const [from, setFrom] = useState<string>(filters.range.from);
  const [to, setTo] = useState<string>(filters.range.to);

  return (
    <div className="space-y-3">
      <div className="bg-muted grid grid-cols-4 gap-1 rounded-full p-1" role="group" aria-label="Periodo">
        {PRESETS.map((preset) => {
          const active = filters.rango === preset.value && !custom;
          return (
            <Button
              key={preset.value}
              asChild
              variant="ghost"
              size="sm"
              className={cn("h-10 px-1 text-[13px]", active && "bg-card shadow-toga-sm hover:bg-card font-bold")}
            >
              <Link
                href={paymentsHref(filters, { rango: preset.value, desde: null, hasta: null, pagina: null })}
                aria-current={active ? "true" : undefined}
                onClick={() => setCustom(false)}
              >
                {preset.label}
              </Link>
            </Button>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn("h-10 px-1 text-[13px]", custom && "bg-card shadow-toga-sm hover:bg-card font-bold")}
          aria-expanded={custom}
          onClick={() => setCustom((c) => !c)}
        >
          Otro
        </Button>
      </div>

      {custom && (
        <form
          className="bg-card shadow-toga grid grid-cols-2 items-end gap-3 rounded-2xl p-3 sm:flex"
          onSubmit={(event) => {
            event.preventDefault();
            router.push(paymentsHref(filters, { rango: "personalizado", desde: from, hasta: to, pagina: null }));
          }}
        >
          <div className="col-span-2 space-y-1 text-sm sm:flex-1">
            <Label htmlFor="r-from">Desde</Label>
            <DayInput id="r-from" value={from} onChange={setFrom} shortcuts={[]} />
          </div>
          <div className="col-span-2 space-y-1 text-sm sm:flex-1">
            <Label htmlFor="r-to">Hasta</Label>
            <DayInput id="r-to" value={to} onChange={setTo} shortcuts={[]} />
          </div>
          <Button type="submit" className="col-span-2 h-10">
            Ver periodo
          </Button>
        </form>
      )}
    </div>
  );
}
