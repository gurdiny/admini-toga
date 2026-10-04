"use client";

import { useEffect, useState, useTransition } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { Field, FormError } from "@/components/form/field";
import { DayInput } from "@/components/form/day-input";
import { formatPhone } from "@/components/phone-link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { formatCode } from "@/lib/codes";
import { getToday, getTomorrow } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Priority } from "@/generated/prisma/browser";
import { createReminder, searchClients, updateReminder } from "../actions/reminders";
import type { ClientOption } from "../queries";

export type ReminderFormValues = {
  id: string;
  client: ClientOption;
  targetDate: string;
  targetTime: string | null;
  note: string;
  priority: Priority;
};

type Props = {
  /** Con `reminder` edita; sin él, captura uno nuevo. */
  reminder?: ReminderFormValues;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ReminderFormDialog({ trigger, open, onOpenChange, reminder }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {/* El formulario se monta al abrir: siempre arranca limpio. */}
        <ReminderForm reminder={reminder} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

type NewClient = { name: string; phone: string };

/** Lo que se escribió en el buscador se usa para precargar el cliente nuevo. */
function guessNewClient(search: string): NewClient {
  const text = search.trim();
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 7 && digits.length === text.replace(/[\s()+-]/g, "").length) {
    return { name: "", phone: text };
  }
  return { name: text, phone: "" };
}

function ReminderForm({ reminder, onDone }: { reminder?: ReminderFormValues; onDone: () => void }) {
  const isEdit = Boolean(reminder);
  const [client, setClient] = useState<ClientOption | null>(reminder?.client ?? null);
  const [newClient, setNewClient] = useState<NewClient | null>(null);
  const [values, setValues] = useState(() => ({
    targetDate: reminder?.targetDate ?? (getTomorrow() as string),
    targetTime: reminder?.targetTime ?? "",
    note: reminder?.note ?? "",
    priority: reminder?.priority ?? ("NORMAL" as Priority),
  }));
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const create = useAction(createReminder, {
    errorToast: false,
    success: (saved) =>
      saved.newClient ? `Recordatorio guardado. Cliente nuevo con folio ${formatCode("client", saved.clientCode)}.` : "Recordatorio guardado.",
    onSuccess: onDone,
  });
  const update = useAction(updateReminder, { errorToast: false, success: "Recordatorio actualizado.", onSuccess: onDone });
  const action = isEdit ? update : create;
  const errors = action.fieldErrors;
  const clientError = errors.clientId ?? errors.newClient;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const input = {
      clientId: newClient ? null : (client?.id ?? null),
      newClient: newClient ?? null,
      targetDate: values.targetDate,
      targetTime: values.targetTime || null,
      note: values.note,
      priority: values.priority,
    };
    if (reminder) update.run({ ...input, id: reminder.id });
    else create.run(input);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Editar recordatorio" : "Nuevo recordatorio"}</DialogTitle>
        <DialogDescription>Pedido de un cliente para entregar o avisar en una fecha.</DialogDescription>
      </DialogHeader>

      <form id="reminder-form" onSubmit={submit} className="space-y-4">
        <FormError message={action.error && !Object.keys(errors).length ? action.error : null} />

        {newClient ? (
          <fieldset className="bg-muted/50 space-y-4 rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-2">
              <legend className="font-bold">Cliente nuevo</legend>
              <Button type="button" variant="ghost" size="sm" onClick={() => setNewClient(null)}>
                Buscar otro
              </Button>
            </div>
            <Field label="Nombre del cliente" htmlFor="c-name" required error={errors["newClient.name"]}>
              <Input
                id="c-name"
                value={newClient.name}
                onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                autoComplete="off"
                autoFocus={!newClient.name}
                className="h-11"
                aria-invalid={!!errors["newClient.name"]}
              />
            </Field>
            <Field label="Teléfono (WhatsApp)" htmlFor="c-phone" error={errors["newClient.phone"]} hint="10 dígitos. Opcional, pero sirve para avisarle.">
              <Input
                id="c-phone"
                type="tel"
                inputMode="tel"
                value={newClient.phone}
                onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                className="h-11"
                aria-invalid={!!errors["newClient.phone"]}
              />
            </Field>
            <p className="text-muted-foreground text-sm">El folio (CLI-0001…) se le asigna solo al guardar y nunca se repite.</p>
          </fieldset>
        ) : (
          <Field label="Cliente" htmlFor="r-client" required error={clientError}>
            {client ? (
              <div className="bg-toga-green-soft flex min-h-14 items-center gap-3 rounded-2xl px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{client.name}</p>
                  <ClientDetail client={client} />
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setClient(null)} aria-label="Cambiar de cliente">
                  <X aria-hidden /> Cambiar
                </Button>
              </div>
            ) : (
              <ClientSearch
                onPick={setClient}
                onCreate={(search) => setNewClient(guessNewClient(search))}
                invalid={!!clientError}
              />
            )}
          </Field>
        )}

        <Field label="¿Qué hay que hacer?" htmlFor="r-note" required error={errors.note}>
          <Textarea
            id="r-note"
            value={values.note}
            onChange={(e) => set("note", e.target.value)}
            rows={3}
            placeholder="Ej. Cadena de plata .925 con dije grabado"
            aria-invalid={!!errors.note}
          />
        </Field>

        <Field label="¿Para cuándo?" htmlFor="r-date" required error={errors.targetDate}>
          <DayInput
            id="r-date"
            value={values.targetDate}
            onChange={(v) => set("targetDate", v)}
            shortcuts={[
              { label: "Hoy", offset: 0 },
              { label: "Mañana", offset: 1 },
            ]}
            min={getToday()}
            aria-invalid={!!errors.targetDate}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Hora límite" htmlFor="r-time" error={errors.targetTime}>
            <Input id="r-time" type="time" value={values.targetTime} onChange={(e) => set("targetTime", e.target.value)} className="h-11" />
          </Field>
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium">Prioridad</legend>
            <div className="bg-muted grid h-11 grid-cols-2 gap-1 rounded-full p-1" role="radiogroup" aria-label="Prioridad">
              {(["NORMAL", "ALTA"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={values.priority === p}
                  onClick={() => set("priority", p)}
                  className={cn(
                    "rounded-full text-sm",
                    values.priority === p && (p === "ALTA" ? "bg-destructive font-bold text-white" : "bg-card shadow-toga-sm font-bold"),
                  )}
                >
                  {p === "ALTA" ? "Alta" : "Normal"}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </form>

      <DialogFooter>
        <Button type="button" variant="ghost" size="lg" onClick={onDone} disabled={action.pending} className="sm:h-10 sm:text-sm">
          Cancelar
        </Button>
        <Button type="submit" variant="brand" size="lg" form="reminder-form" disabled={action.pending} className="sm:h-10 sm:text-sm">
          {action.pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Guardar recordatorio"}
        </Button>
      </DialogFooter>
    </>
  );
}

function ClientDetail({ client }: { client: ClientOption }) {
  const parts = [formatCode("client", client.code), client.phone && formatPhone(client.phone)].filter(Boolean);
  return <p className="text-muted-foreground truncate text-sm">{parts.join(" · ")}</p>;
}

/** Busca en el servidor mientras se escribe; si no está, ofrece darlo de alta. */
function ClientSearch({
  onPick,
  onCreate,
  invalid,
}: {
  onPick: (client: ClientOption) => void;
  onCreate: (search: string) => void;
  invalid: boolean;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ClientOption[] | null>(null);
  const [loading, startLoading] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      () =>
        startLoading(async () => {
          const result = await searchClients({ q: search });
          if (!cancelled) setResults(result.ok ? result.data : []);
        }),
      search ? 250 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  const text = search.trim();
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" aria-hidden />
        <Input
          id="r-client"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nombre, folio o teléfono"
          autoComplete="off"
          enterKeyHint="search"
          className="h-11 rounded-full pl-10"
          aria-invalid={invalid}
          aria-controls="r-client-results"
        />
      </div>
      <ul id="r-client-results" className="divide-y overflow-hidden rounded-2xl border" aria-busy={loading}>
        {results === null ? (
          <li className="text-muted-foreground px-4 py-3 text-sm">Buscando…</li>
        ) : (
          <>
            {!text && results.length > 0 && <li className="text-muted-foreground px-4 pt-2 pb-1 text-xs">Recientes</li>}
            {results.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onPick(c)} className="hover:bg-muted flex min-h-12 w-full flex-col justify-center px-4 py-2 text-left">
                  <span className="font-bold">{c.name}</span>
                  <ClientDetail client={c} />
                </button>
              </li>
            ))}
            {text && results.length === 0 && !loading && (
              <li className="text-muted-foreground px-4 py-3 text-sm">Ningún cliente coincide con «{text}».</li>
            )}
          </>
        )}
        <li>
          <button
            type="button"
            onClick={() => onCreate(search)}
            className="text-toga-pink-strong hover:bg-toga-pink-soft flex min-h-12 w-full items-center gap-2 px-4 text-left font-bold"
          >
            <UserPlus className="size-4" aria-hidden />
            {text ? `Cliente nuevo «${text}»` : "Cliente nuevo"}
          </button>
        </li>
      </ul>
    </div>
  );
}
