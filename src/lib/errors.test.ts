import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { AuthorizationError, BusinessError, toFailure } from "./errors";

function dbError(code: string, cause: object) {
  return new Prisma.PrismaClientKnownRequestError("db error", {
    code,
    clientVersion: "7.10.0",
    meta: { driverAdapterError: { name: "DriverAdapterError", cause } },
  });
}

const message = (error: unknown) => {
  const result = toFailure(error);
  return result.ok ? null : result.error;
};

describe("toFailure", () => {
  it("trigger de saldo → mensaje con el código del adeudo", () => {
    const error = dbError("P2039", {
      originalCode: "23514",
      originalMessage: "ABONO_EXCEDE_SALDO: el adeudo ADE-0002 es de 25000.00 y los abonos sumarían 30000.00",
    });
    expect(message(error)).toBe("El abono es mayor que el saldo pendiente del adeudo ADE-0002.");
  });

  it("CHECK de monto positivo", () => {
    const error = dbError("P2039", {
      originalCode: "23514",
      originalMessage: 'new row for relation "supplier_payments" violates check constraint "supplier_payments_amount_positive"',
    });
    expect(message(error)).toBe("El monto debe ser mayor a cero.");
  });

  it("duplicado según el índice", () => {
    const error = dbError("P2002", { originalCode: "23505", constraint: { index: "suppliers_nameKey_key" } });
    expect(message(error)).toBe("Ya existe un proveedor con ese nombre.");
  });

  it("permisos y reglas de negocio pasan su mensaje", () => {
    expect(message(new AuthorizationError())).toBe("No tienes permiso para hacer esto.");
    expect(message(new BusinessError("Ese proveedor está desactivado."))).toBe("Ese proveedor está desactivado.");
  });

  it("un error inesperado no expone detalles", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(message(new Error("connection reset by peer at 10.0.0.3"))).toBe(
      "Ocurrió un error inesperado. Intenta de nuevo.",
    );
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
