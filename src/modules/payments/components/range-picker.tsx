"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      <div className="flex flex-wrap gap-2" role="group" aria-label="Periodo">
        {PRESETS.map((preset) => {
          const active = filters.rango === preset.value && !custom;
          return (
            <Button key={preset.value} asChild variant={active ? "default" : "outline"} size="sm" className="h-10">
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
          variant={custom ? "default" : "outline"}
          className="h-10"
          aria-expanded={custom}
          onClick={() => setCustom((c) => !c)}
        >
          Personalizado
        </Button>
      </div>

      {custom && (
        <form
          className={cn("bg-card flex flex-wrap items-end gap-3 rounded-lg border p-3")}
          onSubmit={(event) => {
            event.preventDefault();
            router.push(paymentsHref(filters, { rango: "personalizado", desde: from, hasta: to, pagina: null }));
          }}
        >
          <label className="space-y-1 text-sm">
            <span>Desde</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10" required />
          </label>
          <label className="space-y-1 text-sm">
            <span>Hasta</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10" required />
          </label>
          <Button type="submit" className="h-10">
            Aplicar
          </Button>
        </form>
      )}
    </div>
  );
}
