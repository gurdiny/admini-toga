"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Check, ChevronRight, Clock, Hash, MessageCircle, Pencil, Phone, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatPhone } from "@/components/phone-link";
import { RowMenu } from "@/components/row-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAction } from "@/hooks/use-action";
import { formatCode } from "@/lib/codes";
import { formatDay } from "@/lib/date";
import { cn } from "@/lib/utils";
import { softDeleteReminder, toggleCompleted } from "../actions/reminders";
import type { Placement } from "../buckets";
import type { ReminderItem } from "../queries";
import { ReminderFormDialog } from "./reminder-form-dialog";

export type ReminderRow = ReminderItem & {
  canEdit: boolean;
  canDelete: boolean;
  /** En los resultados del buscador: en qué pestaña está. */
  placement?: Placement;
};

const PLACEMENT_BADGE: Partial<Record<Placement, { label: string; className: string }>> = {
  hoy: { label: "Hoy", className: "bg-toga-pink-soft text-toga-pink-strong" },
  manana: { label: "Mañana", className: "bg-muted text-foreground" },
  atrasados: { label: "Atrasado", className: "bg-destructive/10 text-destructive" },
  despues: { label: "Más adelante", className: "bg-muted text-foreground" },
};

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
      const undo = {
        label: "Deshacer",
        onClick: () =>
          startTransition(async () => {
            const result = await toggleCompleted({ id: item.id, completed: !completed });
            if (!result.ok) toast.error(result.error);
          }),
      };
      const readyUrl = item.readyUrl;
      if (completed && readyUrl) {
        // Recién terminado: lo natural es avisarle al cliente que ya puede pasar.
        toast.success(`Listo: ${item.client.name}`, {
          duration: 10000,
          action: { label: "Avisar por WhatsApp", onClick: () => window.open(readyUrl, "_blank", "noopener") },
          cancel: undo,
        });
      } else {
        toast.success(completed ? `Listo: ${item.client.name}` : `${item.client.name} vuelve a pendientes`, { action: undo });
      }
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
  const [viewing, setViewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useAction(softDeleteReminder, {
    success: "Recordatorio borrado. El dueño puede restaurarlo desde la papelera.",
    onSuccess: () => setDeleting(false),
  });
  const done = item.isCompleted;
  const urgent = item.priority === "ALTA" && !done;

  return (
    <li
      className={cn(
        "bg-card shadow-toga flex items-start gap-3 rounded-2xl pt-3 pr-1 pl-3",
        urgent && "ring-destructive/40 ring-1",
      )}
    >
      <ReminderCheckbox item={item} onToggle={onToggle} />

      <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-base leading-snug font-bold", done && "text-muted-foreground line-through decoration-1")}>{item.client.name}</p>
          <span className="flex shrink-0 gap-1">
            {item.placement && PLACEMENT_BADGE[item.placement] && !done && (
              <Badge variant="secondary" className={PLACEMENT_BADGE[item.placement]!.className}>
                {PLACEMENT_BADGE[item.placement]!.label}
              </Badge>
            )}
            {urgent && <Badge variant="destructive">Alta</Badge>}
          </span>
        </div>
        <ClientTags item={item} />
        <p className={cn("line-clamp-2 text-sm whitespace-pre-line", done && "text-muted-foreground")}>{item.note}</p>
        <WhenText item={item} showDate={showDate} />
        {done && item.completedAtLabel && (
          <p className="text-toga-green-strong text-xs">
            Completado {item.completedAtLabel}
            {item.completedByName && ` por ${item.completedByName}`}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2 pb-2">
          <Button type="button" variant="ghost" size="sm" className="text-toga-pink-strong -ml-3 font-bold" onClick={() => setViewing(true)}>
            Ver detalle
            <ChevronRight aria-hidden />
          </Button>
          {done && item.readyUrl && <ReadyButton url={item.readyUrl} size="sm" />}
        </div>
      </div>

      <RowMenu
        label={item.client.name}
        onEdit={item.canEdit ? () => setEditing(true) : undefined}
        onDelete={item.canDelete ? () => setDeleting(true) : undefined}
      />

      <ReminderDetailDialog
        item={item}
        open={viewing}
        onOpenChange={setViewing}
        onToggle={(completed) => {
          setViewing(false);
          onToggle(completed);
        }}
        onEdit={item.canEdit ? () => (setViewing(false), setEditing(true)) : undefined}
        onDelete={item.canDelete ? () => (setViewing(false), setDeleting(true)) : undefined}
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
    </li>
  );
}

function ReminderCheckbox({ item, onToggle }: { item: ReminderRow; onToggle: (completed: boolean) => void }) {
  const done = item.isCompleted;
  return (
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
  );
}

function ClientTags({ item }: { item: ReminderRow }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="bg-muted inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-bold">
        <Hash className="size-3" aria-hidden />
        {formatCode("client", item.client.code)}
      </span>
      {item.client.phone && (
        <a
          href={`https://wa.me/52${item.client.phone}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`WhatsApp a ${item.client.name}: ${formatPhone(item.client.phone)}`}
          // El chip se ve de 32 px, pero el área que se toca mide 40.
          className="-my-1 inline-flex h-10 items-center"
        >
          <span className="bg-toga-green-soft text-toga-green-strong inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-bold">
            <MessageCircle className="size-3.5" aria-hidden />
            {formatPhone(item.client.phone)}
          </span>
        </a>
      )}
    </div>
  );
}

function WhenText({ item, showDate }: { item: ReminderRow; showDate?: boolean }) {
  if (!item.targetTime && !showDate) return null;
  return (
    <p className="text-muted-foreground flex items-center gap-1 text-xs">
      <Clock className="size-3.5" aria-hidden />
      {showDate && <span className="first-letter:uppercase">{formatDay(item.targetDate, "EEE d MMM")}</span>}
      {showDate && item.targetTime && " · "}
      {item.targetTime && `antes de las ${item.targetTime}`}
    </p>
  );
}

/** Todo el pedido en un panel: en celular sube desde abajo. */
function ReminderDetailDialog({
  item,
  open,
  onOpenChange,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: ReminderRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (completed: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const done = item.isCompleted;
  const folio = formatCode("client", item.client.code);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{item.client.name}</DialogTitle>
          <DialogDescription>Folio {folio}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className={cn(done ? "bg-toga-green-soft text-toga-green-strong" : "bg-toga-pink-soft text-toga-pink-strong")}>
            {done ? "Completado" : "Pendiente"}
          </Badge>
          {item.priority === "ALTA" && <Badge variant="destructive">Prioridad alta</Badge>}
        </div>

        <dl className="divide-y rounded-2xl border text-sm">
          <DetailRow label="Para">
            <span className="block first-letter:uppercase">{formatDay(item.targetDate, "EEEE d 'de' MMMM yyyy")}</span>
            {item.targetTime && <span className="text-muted-foreground block">antes de las {item.targetTime}</span>}
          </DetailRow>
          <DetailRow label="Pedido">
            <span className="whitespace-pre-line">{item.note}</span>
          </DetailRow>
          <DetailRow label="Cliente">
            {item.client.phone ? (
              <span className="flex flex-wrap gap-2 pt-0.5">
                <Button asChild size="sm" variant="secondary" className="bg-toga-green-soft text-toga-green-strong">
                  <a href={`https://wa.me/52${item.client.phone}`} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden /> WhatsApp
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`tel:+52${item.client.phone}`}>
                    <Phone aria-hidden /> {formatPhone(item.client.phone)}
                  </a>
                </Button>
              </span>
            ) : (
              <span className="text-muted-foreground">Sin teléfono</span>
            )}
          </DetailRow>
          <DetailRow label="Capturado">
            {item.createdAtLabel} por {item.createdByName}
          </DetailRow>
          {done && item.completedAtLabel && (
            <DetailRow label="Completado">
              {item.completedAtLabel}
              {item.completedByName && ` por ${item.completedByName}`}
            </DetailRow>
          )}
        </dl>

        {/* Siempre en columna: la acción principal arriba y a todo lo ancho, Editar/Borrar abajo. */}
        <DialogFooter className="sm:flex-col-reverse sm:justify-start">
          {(onEdit || onDelete) && (
            <div className="grid grid-cols-2 gap-2">
              {onEdit && (
                <Button type="button" variant="outline" size="lg" className={cn("sm:h-10 sm:text-sm", !onDelete && "col-span-2")} onClick={onEdit}>
                  <Pencil aria-hidden /> Editar
                </Button>
              )}
              {onDelete && (
                <Button type="button" variant="outline" size="lg" className={cn("text-destructive sm:h-10 sm:text-sm", !onEdit && "col-span-2")} onClick={onDelete}>
                  <Trash2 aria-hidden /> Borrar
                </Button>
              )}
            </div>
          )}
          <Button type="button" variant={done ? "outline" : "brand"} size="lg" className="w-full sm:h-10 sm:text-sm" onClick={() => onToggle(!done)}>
            {done ? (
              <>
                <Undo2 aria-hidden /> Regresar a pendientes
              </>
            ) : (
              <>
                <Check aria-hidden /> Marcar como completado
              </>
            )}
          </Button>
          {done && item.readyUrl && <ReadyButton url={item.readyUrl} size="lg" className="w-full sm:h-10 sm:text-sm" />}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 px-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** Abre WhatsApp con el aviso «tu pedido ya está listo» (plantilla de la configuración). */
function ReadyButton({ url, size, className }: { url: string; size: "sm" | "lg"; className?: string }) {
  return (
    <Button asChild size={size} className={cn("bg-toga-green-strong hover:bg-toga-green-strong/90 text-white", className)}>
      <a href={url} target="_blank" rel="noopener noreferrer">
        <MessageCircle aria-hidden /> Avisar que está listo
      </a>
    </Button>
  );
}
