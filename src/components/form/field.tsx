import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

type Props = {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

/** Etiqueta + control + mensaje de error o ayuda debajo. */
export function Field({ label, htmlFor, error, hint, required, className, children }: Props) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive" aria-hidden> *</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Error general del formulario (el que no pertenece a un campo). */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm" role="alert">
      {message}
    </p>
  );
}
