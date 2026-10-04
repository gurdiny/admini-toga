"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDays, getToday, type DayKey } from "@/lib/date";

type Props = {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  /** Atajos debajo del campo. Por defecto Hoy y Ayer. */
  shortcuts?: { label: string; offset: number }[];
  "aria-invalid"?: boolean;
};

/** Fecha (día de México) con selector nativo del celular y atajos. */
export function DayInput({ id, name, value, onChange, shortcuts, ...props }: Props) {
  const today = getToday();
  const options = shortcuts ?? [
    { label: "Hoy", offset: 0 },
    { label: "Ayer", offset: -1 },
  ];
  return (
    <div className="space-y-2">
      <Input id={id} name={name} type="date" value={value} onChange={(e) => onChange(e.target.value)} className="h-11" {...props} />
      <div className="flex gap-2">
        {options.map((option) => {
          const day: DayKey = addDays(today, option.offset);
          return (
            <Button
              key={option.label}
              type="button"
              size="sm"
              variant={value === day ? "secondary" : "outline"}
              onClick={() => onChange(day)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
