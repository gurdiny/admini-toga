"use client";

import { useState } from "react";
import { Field, FormError } from "@/components/form/field";
import { DayInput } from "@/components/form/day-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { formatCode } from "@/lib/codes";
import { getToday } from "@/lib/date";
import { rescheduleReminder } from "../actions/reminders";
import type { ReminderItem } from "../queries";

type Props = {
  item: Pick<ReminderItem, "id" | "client" | "note" | "targetDate" | "targetTime">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Mover un pedido de día (y de hora) sin poder tocar lo demás: el mostrador
 * lo usa en pedidos que no capturó él hoy. El pedido se ve, pero no se edita.
 */
export function RescheduleDialog({ item, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {/* El formulario se monta al abrir: siempre arranca con la fecha actual del pedido. */}
        <RescheduleForm item={item} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RescheduleForm({ item, onDone }: { item: Props["item"]; onDone: () => void }) {
  const [targetDate, setTargetDate] = useState(item.targetDate as string);
  const [targetTime, setTargetTime] = useState(item.targetTime ?? "");
  const action = useAction(rescheduleReminder, { errorToast: false, success: "Fecha actualizada.", onSuccess: onDone });
  const errors = action.fieldErrors;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    action.run({ id: item.id, targetDate, targetTime: targetTime || null });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Cambiar fecha</DialogTitle>
        <DialogDescription>
          {item.client.name} · {formatCode("client", item.client.code)}
        </DialogDescription>
      </DialogHeader>

      <form id="reschedule-form" onSubmit={submit} className="space-y-4">
        <FormError message={action.error && !Object.keys(errors).length ? action.error : null} />

        <div className="bg-muted/50 rounded-2xl px-4 py-3 text-sm">
          <p className="text-muted-foreground mb-1 text-xs font-bold">Pedido</p>
          <p className="line-clamp-4 whitespace-pre-line">{item.note}</p>
        </div>

        <Field label="¿Para cuándo?" htmlFor="rs-date" required error={errors.targetDate}>
          <DayInput
            id="rs-date"
            value={targetDate}
            onChange={setTargetDate}
            shortcuts={[
              { label: "Hoy", offset: 0 },
              { label: "Mañana", offset: 1 },
            ]}
            min={getToday()}
            aria-invalid={!!errors.targetDate}
          />
        </Field>

        <Field label="Hora límite" htmlFor="rs-time" error={errors.targetTime} hint="Opcional. Déjala vacía si no tiene hora.">
          <Input id="rs-time" type="time" value={targetTime} onChange={(e) => setTargetTime(e.target.value)} className="h-11" />
        </Field>
      </form>

      <DialogFooter>
        <Button type="button" variant="ghost" size="lg" onClick={onDone} disabled={action.pending} className="sm:h-10 sm:text-sm">
          Cancelar
        </Button>
        <Button type="submit" variant="brand" size="lg" form="reschedule-form" disabled={action.pending} className="sm:h-10 sm:text-sm">
          {action.pending ? "Guardando…" : "Guardar fecha"}
        </Button>
      </DialogFooter>
    </>
  );
}
