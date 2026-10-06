import { cn } from "@/lib/utils";

const SMALL_WORDS = new Set(["y", "e", "de", "del", "la", "las", "el", "los", "a"]);

/** «Platería Taxco Hernández» → «PT»; «Soldadura y Pulido Méndez» → «SP». */
export function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w && !SMALL_WORDS.has(w.toLowerCase()));
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toLocaleUpperCase("es-MX"))
    .join("");
}

/** Iniciales grabadas en una moneda de plata: reconocer a un proveedor de un vistazo. */
export function Monogram({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "font-heading text-plata-ink/80 flex size-10 shrink-0 items-center justify-center rounded-full text-[0.8125rem] tracking-wide",
        "bg-[radial-gradient(circle_at_30%_25%,#ffffff,var(--plata-2)_55%,var(--plata-3))]",
        "shadow-[inset_0_1px_0_rgb(255_255_255/0.9),inset_0_-1px_1px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.06)]",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
