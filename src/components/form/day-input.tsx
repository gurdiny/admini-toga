"use client";

import { useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { Calendar } from "@/components/form/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addDays, formatDay, getToday, isDayKey, type DayKey } from "@/lib/date";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Atajos debajo del campo. Por defecto Hoy y Ayer; [] para ninguno. */
  shortcuts?: { label: string; offset: number }[];
  /** Días anteriores a este no se pueden elegir (ni con los atajos). */
  min?: DayKey;
  /** Campo opcional: muestra una × para dejarlo vacío. */
  clearable?: boolean;
  placeholder?: string;
  className?: string;
  "aria-invalid"?: boolean;
};

/** Fecha (día de México) con el calendario de TOGA y atajos. */
export function DayInput({ id, value, onChange, shortcuts, min, clearable, placeholder = "Elige una fecha", className, ...props }: Props) {
  const [open, setOpen] = useState(false);
  const today = getToday();
  const selected = isDayKey(value) ? value : null;
  const options = shortcuts ?? [
    { label: "Hoy", offset: 0 },
    { label: "Ayer", offset: -1 },
  ];

  return (
    <div className="space-y-2">
      <div className="relative">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              aria-invalid={props["aria-invalid"]}
              className={cn("h-11 w-full justify-start gap-2 rounded-lg px-3 font-normal", clearable && selected && "pr-10", className)}
            >
              <CalendarDays className="text-toga-pink-strong" aria-hidden />
              {selected ? (
                <span className="truncate first-letter:uppercase">{formatDay(selected, "EEEE d 'de' MMMM yyyy")}</span>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto rounded-2xl p-3" align="start">
            <Calendar
              value={selected}
              min={min}
              onSelect={(day) => {
                onChange(day);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        {clearable && selected && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1/2 right-0.5 size-9 -translate-y-1/2"
            onClick={() => onChange("")}
            aria-label="Quitar fecha"
          >
            <X aria-hidden />
          </Button>
        )}
      </div>
      {options.length > 0 && (
        <div className="flex gap-2">
          {options.map((option) => {
            const day: DayKey = addDays(today, option.offset);
            if (min && day < min) return null;
            return (
              <Button key={option.label} type="button" size="sm" variant={value === day ? "secondary" : "outline"} onClick={() => onChange(day)}>
                {option.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
