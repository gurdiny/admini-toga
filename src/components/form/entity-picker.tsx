"use client";

import { Check, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PickerItem = {
  id: string;
  title: string;
  /** Segunda línea en gris: código, teléfono… */
  detail?: string;
};

type Props = {
  id: string;
  /** Lo elegido; con él se muestra la tarjeta verde en vez del buscador. */
  selected: PickerItem | null;
  /** Sin esto no aparece «Cambiar» (p. ej. un abono amarrado a su proveedor). */
  onClear?: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  placeholder: string;
  items: PickerItem[] | null;
  onPick: (id: string) => void;
  /** Texto arriba de la lista cuando no se ha escrito nada («Recientes»). */
  idleLabel?: string;
  /** «Ningún cliente coincide con…» */
  emptyText: (query: string) => string;
  /** «Cliente nuevo» / «Nuevo proveedor»; recibe lo escrito. */
  createLabel: (query: string) => string;
  onCreate: (query: string) => void;
  loading?: boolean;
  invalid?: boolean;
};

/**
 * Buscador con lista para elegir un registro dentro de un formulario
 * (clientes, proveedores). Va dentro del formulario, no flotando: en el
 * celular no tapa los demás campos. Mismo aspecto en todos lados.
 */
export function EntityPicker({
  id,
  selected,
  onClear,
  query,
  onQueryChange,
  placeholder,
  items,
  onPick,
  idleLabel,
  emptyText,
  createLabel,
  onCreate,
  loading,
  invalid,
}: Props) {
  if (selected) {
    return (
      <div id={id} className="bg-toga-green-soft flex min-h-14 items-center gap-3 rounded-2xl py-2 pr-1 pl-4">
        <Check className="text-toga-green-strong size-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{selected.title}</p>
          {selected.detail && <p className="text-muted-foreground truncate text-sm">{selected.detail}</p>}
        </div>
        {onClear && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear} aria-label={`Cambiar: ${selected.title}`}>
            <X aria-hidden /> Cambiar
          </Button>
        )}
      </div>
    );
  }

  const text = query.trim();
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" aria-hidden />
        <Input
          id={id}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="search"
          className="h-11 rounded-full pl-10"
          aria-invalid={invalid}
          aria-controls={`${id}-results`}
        />
      </div>
      <ul id={`${id}-results`} className="max-h-72 divide-y overflow-y-auto rounded-2xl border" aria-busy={loading}>
        {items === null ? (
          <li className="text-muted-foreground px-4 py-3 text-sm">Buscando…</li>
        ) : (
          <>
            {!text && idleLabel && items.length > 0 && <li className="text-muted-foreground px-4 pt-2 pb-1 text-xs">{idleLabel}</li>}
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onPick(item.id)}
                  className="hover:bg-muted flex min-h-12 w-full flex-col justify-center px-4 py-2 text-left"
                >
                  <span className="font-bold">{item.title}</span>
                  {item.detail && <span className="text-muted-foreground text-sm">{item.detail}</span>}
                </button>
              </li>
            ))}
            {text && items.length === 0 && !loading && <li className="text-muted-foreground px-4 py-3 text-sm">{emptyText(text)}</li>}
          </>
        )}
        <li className="bg-card sticky bottom-0">
          <button
            type="button"
            onClick={() => onCreate(query)}
            className="text-toga-pink-strong hover:bg-toga-pink-soft flex min-h-12 w-full items-center gap-2 px-4 text-left font-bold"
          >
            <Plus className="size-4" aria-hidden />
            {createLabel(text)}
          </button>
        </li>
      </ul>
    </div>
  );
}
