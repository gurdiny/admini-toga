"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { Result } from "@/lib/result";

type Options<T> = {
  /** Mensaje del aviso verde. Sin él, no se muestra aviso al terminar bien. */
  success?: string | ((data: T) => string);
  onSuccess?: (data: T) => void;
  /**
   * Mostrar el error como aviso flotante. En formularios va en false: el error
   * ya se muestra dentro del formulario y no debe salir dos veces.
   */
  errorToast?: boolean;
};

/**
 * Llama una Server Action desde un formulario: maneja "guardando…", los
 * errores por campo y los avisos. Nunca lanza: las acciones devuelven Result.
 */
export function useAction<I, T>(action: (input: I) => Promise<Result<T>>, options: Options<T> = {}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function run(input: I) {
    startTransition(async () => {
      const result = await action(input);
      if (result.ok) {
        setError(null);
        setFieldErrors({});
        const message = typeof options.success === "function" ? options.success(result.data) : options.success;
        if (message) toast.success(message);
        options.onSuccess?.(result.data);
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        // Con errores por campo, el mensaje ya se ve junto a cada campo.
        if (!result.fieldErrors && options.errorToast !== false) toast.error(result.error);
      }
    });
  }

  function reset() {
    setError(null);
    setFieldErrors({});
  }

  return { run, pending, error, fieldErrors, reset };
}
