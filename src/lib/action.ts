import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import type { Role } from "@/generated/prisma/client";
import { requireRole, type CurrentUser } from "@/lib/auth/session";
import { toFailure, zodFieldErrors } from "@/lib/errors";
import { fail, ok, type Result } from "@/lib/result";

type ActionConfig<S extends z.ZodType> = {
  /** Rol mínimo. OWNER siempre pasa. */
  role: Role;
  schema: S;
  /** Rutas a refrescar después de una escritura exitosa. */
  revalidate?: string[];
};

type Handler<S extends z.ZodType, T> = (
  input: z.output<S>,
  ctx: { user: CurrentUser },
) => Promise<T>;

/**
 * Estructura obligatoria de toda Server Action:
 *   1. verificar sesión y rol   (antes de mirar los datos)
 *   2. validar con Zod           (en servidor, aunque el formulario ya validó)
 *   3. ejecutar                  (las escrituras usan withAudit)
 *   4. revalidatePath
 *   5. devolver Result<T>        (nunca lanza hacia el cliente)
 *
 * Acepta un objeto o un FormData. Los redirect()/notFound() del handler
 * sí se propagan.
 *
 * @example
 * // src/modules/payments/actions/create-payment.ts
 * "use server";
 * export const createPayment = defineAction(
 *   { role: "STAFF", schema: paymentSchema, revalidate: ["/pagos"] },
 *   async (input, { user }) => withAudit(...),
 * );
 */
export function defineAction<S extends z.ZodType, T>(
  config: ActionConfig<S>,
  handler: Handler<S, T>,
): (input: z.input<S> | FormData) => Promise<Result<T>> {
  return async (input) => {
    try {
      const user = await requireRole(config.role);

      const raw = input instanceof FormData ? Object.fromEntries(input) : input;
      const parsed = config.schema.safeParse(raw);
      if (!parsed.success) {
        return fail("Revisa los datos marcados.", zodFieldErrors(parsed.error));
      }

      const data = await handler(parsed.data, { user });
      config.revalidate?.forEach((path) => revalidatePath(path));
      return ok(data);
    } catch (error) {
      unstable_rethrow(error);
      return toFailure(error);
    }
  };
}
