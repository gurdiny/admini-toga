"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDays, dayToDb, formatDay, getToday, type DayKey } from "@/lib/date";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

/** "2026-10" → primer día del mes. */
const monthStart = (day: DayKey) => `${day.slice(0, 7)}-01` as DayKey;

function shiftMonth(month: DayKey, amount: number): DayKey {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1 + amount, 1));
  return date.toISOString().slice(0, 10) as DayKey;
}

/** Días a mostrar: semanas completas de lunes a domingo; null = hueco. */
function monthGrid(month: DayKey): (DayKey | null)[] {
  const [year, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const offset = (dayToDb(month).getUTCDay() + 6) % 7; // lunes = 0
  const cells: (DayKey | null)[] = Array.from({ length: offset }, () => null);
  for (let i = 0; i < daysInMonth; i++) cells.push(addDays(month, i));
  while (cells.length % 7) cells.push(null);
  return cells;
}

type Props = {
  value: DayKey | null;
  onSelect: (day: DayKey) => void;
  /** Días anteriores a este no se pueden elegir. */
  min?: DayKey;
};

/**
 * Calendario de un mes con los estilos de TOGA (día elegido en rosa, píldoras).
 * Trabaja con días calendario (DayKey): «hoy» es el día de México, no el del
 * celular, y no depende de la zona horaria del navegador.
 */
export function Calendar({ value, onSelect, min }: Props) {
  const today = getToday();
  const [month, setMonth] = useState<DayKey>(() => monthStart(value ?? today));
  const canGoBack = !min || shiftMonth(month, -1) >= monthStart(min);

  return (
    <div className="w-[17.5rem] space-y-2 select-none">
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="icon" onClick={() => setMonth(shiftMonth(month, -1))} disabled={!canGoBack} aria-label="Mes anterior">
          <ChevronLeft aria-hidden />
        </Button>
        <p className="font-bold first-letter:uppercase" aria-live="polite" data-month={month.slice(0, 7)}>
          {formatDay(month, "MMMM yyyy")}
        </p>
        <Button type="button" variant="ghost" size="icon" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mes siguiente">
          <ChevronRight aria-hidden />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center" role="grid" aria-label={formatDay(month, "MMMM yyyy")}>
        {WEEKDAYS.map((label, i) => (
          <span key={i} className="text-muted-foreground py-1 text-xs font-bold" aria-hidden>
            {label}
          </span>
        ))}
        {monthGrid(month).map((day, i) => {
          if (!day) return <span key={`empty-${i}`} />;
          const disabled = Boolean(min && day < min);
          const selected = day === value;
          const isToday = day === today;
          return (
            <button
              key={day}
              type="button"
              data-day={day}
              disabled={disabled}
              aria-pressed={selected}
              aria-label={`${formatDay(day, "EEEE d 'de' MMMM")}${isToday ? ", hoy" : ""}`}
              onClick={() => onSelect(day)}
              className={cn(
                "mx-auto flex size-10 items-center justify-center rounded-full text-sm tabular-nums transition-colors",
                !selected && !disabled && "hover:bg-toga-pink-soft",
                isToday && !selected && "ring-toga-pink-strong text-toga-pink-strong font-bold ring-1",
                selected && "bg-toga-pink-strong font-bold text-white",
                disabled && "text-muted-foreground/40 cursor-not-allowed line-through decoration-1",
              )}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
