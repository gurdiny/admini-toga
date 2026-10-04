"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Merge, Pencil } from "lucide-react";
import { EntityPicker, type PickerItem } from "@/components/form/entity-picker";
import { Field, FormError } from "@/components/form/field";
import { formatPhone } from "@/components/phone-link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { formatCode } from "@/lib/codes";
import { searchClients } from "@/modules/reminders/actions/reminders";
import type { ClientOption } from "@/modules/reminders/queries";
import { mergeClients, updateClient } from "../actions/clients";

type Client = { id: string; code: number; name: string; phone: string | null; notes: string | null };

export function EditClientButton({ client }: { client: Client }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil aria-hidden /> Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <EditClientForm client={client} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditClientForm({ client, onDone }: { client: Client; onDone: () => void }) {
  const [values, setValues] = useState({ name: client.name, phone: client.phone ?? "", notes: client.notes ?? "" });
  const update = useAction(updateClient, { errorToast: false, success: "Cliente actualizado.", onSuccess: onDone });
  const errors = update.fieldErrors;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar cliente</DialogTitle>
        <DialogDescription>Folio {formatCode("client", client.code)} (no cambia).</DialogDescription>
      </DialogHeader>
      <form
        id="client-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          update.run({ id: client.id, ...values });
        }}
      >
        <FormError message={update.error && !Object.keys(errors).length ? update.error : null} />
        <Field label="Nombre" htmlFor="cl-name" required error={errors.name}>
          <Input id="cl-name" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} className="h-11" />
        </Field>
        <Field label="Teléfono (WhatsApp)" htmlFor="cl-phone" error={errors.phone} hint="10 dígitos">
          <Input id="cl-phone" type="tel" inputMode="tel" value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} className="h-11" />
        </Field>
        <Field label="Notas" htmlFor="cl-notes" error={errors.notes}>
          <Textarea id="cl-notes" rows={3} value={values.notes} onChange={(e) => setValues({ ...values, notes: e.target.value })} />
        </Field>
      </form>
      <DialogFooter>
        <Button type="button" variant="ghost" size="lg" onClick={onDone} disabled={update.pending} className="sm:h-10 sm:text-sm">
          Cancelar
        </Button>
        <Button type="submit" form="client-form" variant="brand" size="lg" disabled={update.pending} className="sm:h-10 sm:text-sm">
          {update.pending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </DialogFooter>
    </>
  );
}

const toItem = (c: ClientOption): PickerItem => ({
  id: c.id,
  title: c.name,
  detail: [formatCode("client", c.code), c.phone && formatPhone(c.phone)].filter(Boolean).join(" · "),
});

/** Elegir el duplicado y confirmar: sus pedidos pasan a este cliente. */
export function MergeClientButton({ client }: { client: Client }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Merge aria-hidden /> Fusionar duplicado
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <MergeForm client={client} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function MergeForm({ client, onDone }: { client: Client; onDone: () => void }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ClientOption[] | null>(null);
  const [duplicate, setDuplicate] = useState<ClientOption | null>(null);
  const [loading, startLoading] = useTransition();
  const merge = useAction(mergeClients, {
    errorToast: false,
    success: (r) => `Listo: ${r.movedOrders} pedido${r.movedOrders === 1 ? "" : "s"} pasaron a ${client.name}.`,
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });

  useEffect(() => {
    if (duplicate) return;
    let cancelled = false;
    const timer = setTimeout(
      () =>
        startLoading(async () => {
          const result = await searchClients({ q: search });
          if (!cancelled) setResults(result.ok ? result.data.filter((c) => c.id !== client.id) : []);
        }),
      search ? 250 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, duplicate, client.id]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Fusionar con un duplicado</DialogTitle>
        <DialogDescription>
          Se queda <strong>{client.name}</strong> ({formatCode("client", client.code)}). Elige el cliente que se capturó de más.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <FormError message={merge.error} />
        <Field label="Cliente duplicado" htmlFor="merge-client" required>
          <EntityPicker
            id="merge-client"
            selected={duplicate ? toItem(duplicate) : null}
            onClear={() => setDuplicate(null)}
            query={search}
            onQueryChange={setSearch}
            placeholder="Nombre, folio o teléfono"
            items={results?.map(toItem) ?? null}
            onPick={(id) => setDuplicate(results?.find((c) => c.id === id) ?? null)}
            idleLabel="Recientes"
            emptyText={(q) => `Ningún otro cliente coincide con «${q}».`}
            loading={loading}
          />
        </Field>
        {duplicate && (
          <p className="bg-toga-pink-soft rounded-2xl p-4 text-sm">
            Los pedidos de <strong>{duplicate.name}</strong> ({formatCode("client", duplicate.code)}) pasarán a{" "}
            <strong>{client.name}</strong>. {duplicate.name} dejará de aparecer en las búsquedas y su folio no se reutiliza. Queda registrado en la
            auditoría.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" size="lg" onClick={onDone} disabled={merge.pending} className="sm:h-10 sm:text-sm">
          Cancelar
        </Button>
        <Button
          type="button"
          variant="brand"
          size="lg"
          disabled={!duplicate || merge.pending}
          onClick={() => duplicate && merge.run({ keepId: client.id, mergeId: duplicate.id })}
          className="sm:h-10 sm:text-sm"
        >
          {merge.pending ? "Fusionando…" : "Fusionar"}
        </Button>
      </DialogFooter>
    </>
  );
}
