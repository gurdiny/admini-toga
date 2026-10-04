"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Command as CommandPrimitive } from "cmdk";
import { ClipboardList, Loader2, Search, Truck, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { searchEverything } from "../actions";
import type { SearchHit, SearchResults } from "../queries";

const GROUPS = [
  { key: "clients", label: "Clientes", icon: ClipboardList },
  { key: "payments", label: "Pagos", icon: Wallet },
  { key: "suppliers", label: "Proveedores", icon: Truck },
] as const;

/**
 * Lupa del encabezado y ⌘K / Ctrl+K: busca clientes (nombre, folio,
 * teléfono), pagos (concepto, proveedor, PAG-0001) y proveedores. Flechas
 * para moverse, Enter para abrir. En celular el panel baja desde arriba para
 * que el teclado no tape los resultados.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Button variant="ghost" size="icon" className="size-10" aria-label="Buscar" aria-keyshortcuts="Control+K Meta+K" onClick={() => setOpen(true)}>
        <Search className="size-5" aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            "gap-0 p-0",
            // Celular: baja desde arriba, el buscador queda sobre el teclado.
            "top-0 bottom-auto max-h-[85dvh] rounded-t-none rounded-b-2xl pt-[env(safe-area-inset-top)] pb-0 data-open:slide-in-from-top data-closed:slide-out-to-top",
            "sm:top-[12%] sm:max-h-[70dvh] sm:max-w-xl sm:translate-y-0 sm:rounded-2xl sm:pt-0",
          )}
        >
          {/* Se monta al abrir: siempre arranca vacío. */}
          <SearchPanel onNavigate={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function SearchPanel({ onNavigate }: { onNavigate: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searched, setSearched] = useState("");
  const [loading, startLoading] = useTransition();
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const ticket = ++latest.current;
    const timer = setTimeout(
      () =>
        startLoading(async () => {
          const result = await searchEverything({ q });
          // Si ya se escribió otra cosa, esta respuesta llega tarde: se ignora.
          if (ticket !== latest.current) return;
          setResults(result.ok ? result.data : { clients: [], payments: [], suppliers: [] });
          setSearched(q);
        }),
      200,
    );
    return () => clearTimeout(timer);
  }, [query]);

  const text = query.trim();
  const shown = text ? results : null;
  const count = shown ? GROUPS.reduce((n, g) => n + shown[g.key].length, 0) : 0;

  function go(hit: SearchHit) {
    onNavigate();
    router.push(hit.href);
  }

  return (
    <CommandPrimitive shouldFilter={false} loop className="flex min-h-0 flex-col" label="Buscar">
      <DialogTitle className="sr-only">Buscar</DialogTitle>
      <DialogDescription className="sr-only">Clientes por nombre, folio o teléfono; pagos por concepto o proveedor.</DialogDescription>
      <div className="flex items-center gap-2 border-b p-3">
        <div className="relative flex-1">
          {loading ? (
            <Loader2 className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2 animate-spin" aria-hidden />
          ) : (
            <Search className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" aria-hidden />
          )}
          <CommandPrimitive.Input
            value={query}
            onValueChange={setQuery}
            autoFocus
            enterKeyHint="search"
            placeholder="Cliente, folio, teléfono o pago"
            aria-label="Buscar"
            // text-base: en iPhone, con menos de 16 px el navegador hace zoom al escribir.
            className="bg-muted/60 focus-visible:ring-ring/40 h-12 w-full rounded-full pr-4 pl-10 text-base outline-none focus-visible:ring-2"
          />
        </div>
        <DialogClose asChild>
          <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="Cerrar">
            <X aria-hidden />
          </Button>
        </DialogClose>
      </div>

      <CommandPrimitive.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {!shown ? (
          <Hint>
            {text ? "Buscando…" : "Escribe el nombre del cliente, su folio (CLI-0005) o teléfono, un pago (PAG-0012) o el concepto o proveedor de un pago."}
          </Hint>
        ) : count === 0 ? (
          <Hint>{loading || searched !== text ? "Buscando…" : `Nada coincide con «${text}». Prueba con el folio o una parte del nombre.`}</Hint>
        ) : (
          GROUPS.map(({ key, label, icon: Icon }) =>
            shown[key].length === 0 ? null : (
              <CommandPrimitive.Group
                key={key}
                heading={label}
                className="**:[[cmdk-group-heading]]:text-muted-foreground mb-1 **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-bold"
              >
                {shown[key].map((hit) => (
                  <CommandPrimitive.Item
                    key={hit.id}
                    value={`${key}-${hit.id}`}
                    onSelect={() => go(hit)}
                    className="data-[selected=true]:bg-toga-green-soft flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-3 py-2"
                  >
                    <Icon className="text-muted-foreground size-[18px] shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{hit.title}</span>
                      <span className="text-muted-foreground block truncate text-sm">{hit.detail}</span>
                    </span>
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            ),
          )
        )}
      </CommandPrimitive.List>
      <p className="text-muted-foreground hidden border-t px-4 py-2 text-xs sm:block">
        <kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> para moverte · <kbd className="font-sans">Enter</kbd> para abrir ·{" "}
        <kbd className="font-sans">Esc</kbd> para cerrar
      </p>
    </CommandPrimitive>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground px-3 py-6 text-center text-sm">{children}</p>;
}
