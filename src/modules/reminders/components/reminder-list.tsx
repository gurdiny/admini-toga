"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Check, Clock, Hash, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatPhone } from "@/components/phone-link";
import { RowMenu } from "@/components/row-menu";
import { Badge } from "@/components/ui/badge";
import { useAction } from "@/hooks/use-action";
import { formatDay } from "@/lib/date";
import { cn } from "@/lib/utils";
import { softDeleteReminder, toggleCompleted } from "../actions/reminders";
import type { ReminderItem } from "../queries";
import { ReminderFormDialog } from "./reminder-form-dialog";

export type ReminderRow = ReminderItem & { canEdit: boolean; canDelete: boolean };

type Props = {
  items: ReminderRow[];
  /** Mostrar la fecha en cada tarjeta (atrasados, más adelante, completados). */
  showDate?: boolean;
};

/**
 * Lista de recordatorios. El checkbox cambia al instante (useOptimistic) y,
 * si la acción falla, regresa solo al terminar la transición. Al refrescar
 * los datos del servidor, el recordatorio se mueve a su nueva pestaña.
 */
export function ReminderList({ items, showDate }: Props) {
  const [, startTransition] = useTransition();
  const [optimisticItems, setCompleted] = useOptimistic(items, (state, change: { id: string; completed: boolean }) =>
    state.map((item) => (item.id === change.id ? { ...item, isCompleted: change.completed } : item)),
  );

  function toggle(item: ReminderRow, completed: boolean) {
    startTransition(async () => {
      setCompleted({ id: item.id, completed });
      const result = await toggleCompleted({ id: item.id, completed });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(completed ? `Listo: ${item.client.name}` : `${item.client.name} vuelve a pendientes`, {
        action: {
          label: "Deshacer",
          onClick: () =>
            startTransition(async () => {
              const undo = await toggleCompleted({ id: item.id, completed: !completed });
              if (!undo.ok) toast.error(undo.error);
            }),
        },
      });
    });
  }

  return (
    <ul className="space-y-3">
      {optimisticItems.map((item) => (
        <ReminderCard key={item.id} item={item} showDate={showDate} onToggle={(completed) => toggle(item, completed)} />
      ))}
    </ul>
  );
}

function ReminderCard({
  item,
  showDate,
  onToggle,
}: {
  item: ReminderRow;
  showDate?: boolean;
  onToggle: (completed: boolean) => void;
}) {
  const done = item.isCompleted;
  const urgent = item.priority === "ALTA" && !done;
  return (
    <li
      className={cn(
        "bg-card shadow-toga flex items-start gap-3 rounded-2xl py-3 pr-1 pl-3 transition-opacity",
        urgent && "ring-destructive/40 ring-1",
        done && "opacity-70",
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${done ? "Desmarcar" : "Marcar como completado"}: ${item.client.name}`}
        onClick={() => onToggle(!done)}
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl border-2 transition-colors active:scale-95",
          done ? "border-toga-green-strong bg-toga-green-strong text-white" : "border-input bg-background hover:border-toga-green",
        )}
      >
        <Check className={cn("size-6", !done && "opacity-0")} strokeWidth={3} aria-hidden />
      </button>

      <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-base leading-snug font-bold", done && "line-through decoration-1")}>{item.client.name}</p>
          {urgent && (
            <Badge variant="destructive" className="shrink-0">
              Alta
            </Badge>
          )}
        </div>

        {(item.client.folio || item.client.phone) && (
          <div className="flex flex-wrap gap-1.5">
            {item.client.folio && (
              <span className="bg-muted inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-bold tracking-wide">
                <Hash className="size-3" aria-hidden />
                {item.client.folio}
              </span>
            )}
            {item.client.phone && (
              <a
                href={`https://wa.me/52${item.client.phone}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`WhatsApp a ${item.client.name}: ${formatPhone(item.client.phone)}`}
                className="bg-toga-green-soft text-toga-green-strong inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-bold"
              >
                <MessageCircle className="size-3.5" aria-hidden />
                {formatPhone(item.client.phone)}
              </a>
            )}
          </div>
        )}

        <p className="text-sm whitespace-pre-line">{item.note}</p>

        {(item.targetTime || showDate) && (
          <p className="text-muted-foreground flex items-center gap-1 text-xs">
            <Clock className="size-3.5" aria-hidden />
            {showDate && <span className="first-letter:uppercase">{formatDay(item.targetDate, "EEE d MMM")}</span>}
            {showDate && item.targetTime && " · "}
            {item.targetTime && `antes de las ${item.targetTime}`}
          </p>
        )}

        {done && item.completedAtLabel && (
          <p className="text-toga-green-strong text-xs">
            Completado {item.completedAtLabel}
            {item.completedByName && ` por ${item.completedByName}`}
          </p>
        )}
      </div>

      <ReminderRowActions item={item} />
    </li>
  );
}

function ReminderRowActions({ item }: { item: ReminderRow }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useAction(softDeleteReminder, {
    success: "Recordatorio borrado. El dueño puede restaurarlo desde la papelera.",
    onSuccess: () => setDeleting(false),
  });

  return (
    <>
      <RowMenu
        label={item.client.name}
        onEdit={item.canEdit ? () => setEditing(true) : undefined}
        onDelete={item.canDelete ? () => setDeleting(true) : undefined}
      />
      {item.canEdit && (
        <ReminderFormDialog
          open={editing}
          onOpenChange={setEditing}
          reminder={{
            id: item.id,
            client: item.client,
            targetDate: item.targetDate,
            targetTime: item.targetTime,
            note: item.note,
            priority: item.priority,
          }}
        />
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`¿Borrar el recordatorio de ${item.client.name}?`}
        description={<span className="whitespace-pre-line">{item.note}</span>}
        pending={remove.pending}
        onConfirm={() => remove.run({ id: item.id })}
      />
    </>
  );
}
