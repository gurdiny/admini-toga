import { describe, expect, it } from "vitest";
import { zodFieldErrors } from "@/lib/errors";
import { addDays, dayToDb, getToday } from "@/lib/date";
import { debtSchema, paymentSchema, supplierSchema } from "@/modules/payments/schemas";
import { clientSchema, reminderSchema } from "@/modules/reminders/schemas";

const today = getToday();
const basePayment = {
  date: today,
  supplierId: "s1",
  categoryId: "c1",
  concept: "  10 g   oro 14k ",
  amount: "1,250.50",
  paymentMethod: "EFECTIVO",
};

function errorsOf(result: { success: boolean; error?: unknown }) {
  return result.success ? {} : zodFieldErrors(result.error as never);
}

describe("pago", () => {
  it("normaliza monto y concepto", () => {
    const data = paymentSchema.parse(basePayment);
    expect(data.amount).toBe("1250.50");
    expect(data.concept).toBe("10 g oro 14k");
    expect(data.currency).toBe("MXN");
    expect(data.debtId).toBeNull();
    expect(data.date).toEqual(dayToDb(today)); // listo para @db.Date
  });

  it("monto negativo → mensaje legible", () => {
    const result = paymentSchema.safeParse({ ...basePayment, amount: "-500" });
    expect(errorsOf(result).amount).toBe("Escribe un monto válido, por ejemplo 1250.50.");
  });

  it("monto cero → mayor a cero", () => {
    expect(errorsOf(paymentSchema.safeParse({ ...basePayment, amount: "0" })).amount).toBe(
      "El monto debe ser mayor a cero.",
    );
  });

  it("campos faltantes con mensaje que concuerda en género", () => {
    const errors = errorsOf(paymentSchema.safeParse({ ...basePayment, categoryId: undefined, concept: " " }));
    expect(errors.categoryId).toBe("Falta la categoría.");
    expect(errors.concept).toBe("Falta el concepto.");
  });

  it("texto en el monto no pasa", () => {
    expect(errorsOf(paymentSchema.safeParse({ ...basePayment, amount: "mil pesos" })).amount).toBeDefined();
  });

  it("fecha a más de un año en el futuro no pasa", () => {
    const result = paymentSchema.safeParse({ ...basePayment, date: addDays(today, 400) });
    expect(errorsOf(result).date).toBe("La fecha no puede ser de más de un año en el futuro.");
  });

  it("en dólares exige tipo de cambio", () => {
    const result = paymentSchema.safeParse({ ...basePayment, currency: "USD" });
    expect(errorsOf(result).exchangeRate).toBe("Indica el tipo de cambio a pesos.");
    expect(paymentSchema.safeParse({ ...basePayment, currency: "USD", exchangeRate: "18.25" }).success).toBe(true);
  });
});

describe("proveedor", () => {
  it("solo el nombre es obligatorio", () => {
    const data = supplierSchema.parse({ name: "Fundición  Hernández " });
    expect(data).toMatchObject({ name: "Fundición Hernández", phone: null, email: null, openingBalance: null });
  });

  it("sin teléfono no puede tener WhatsApp", () => {
    expect(supplierSchema.parse({ name: "X", hasWhatsApp: "on" }).hasWhatsApp).toBe(false);
    expect(supplierSchema.parse({ name: "X", phone: "+52 55 1234 5678", hasWhatsApp: "on" })).toMatchObject({
      phone: "5512345678",
      hasWhatsApp: true,
    });
  });

  it("alta con saldo inicial", () => {
    const data = supplierSchema.parse({ name: "X", openingBalance: { amount: "50,000", date: today } });
    expect(data.openingBalance).toEqual({ amount: "50000.00", date: dayToDb(today), description: null });
  });
});

describe("adeudo", () => {
  it("la fecha límite no puede ser antes del adeudo", () => {
    const result = debtSchema.safeParse({
      supplierId: "s1", date: today, description: "Lote", amount: "3000", dueDate: addDays(today, -1),
    });
    expect(errorsOf(result).dueDate).toBeDefined();
  });
});

describe("cliente y recordatorio", () => {
  it("el cliente necesita teléfono o folio", () => {
    expect(errorsOf(clientSchema.safeParse({ name: "María López" })).phone).toBe(
      "Escribe el teléfono o el folio del cliente.",
    );
    expect(clientSchema.parse({ name: "María López", folio: " joy-8492 " }).folio).toBe("JOY-8492");
  });

  it("nombre de cliente obligatorio", () => {
    expect(errorsOf(clientSchema.safeParse({ name: "   ", phone: "5512345678" })).name).toBe(
      "Falta el nombre del cliente.",
    );
  });

  it("teléfono de menos de 10 dígitos no pasa", () => {
    expect(errorsOf(clientSchema.safeParse({ name: "Ana", phone: "55 1234" })).phone).toBe(
      "El teléfono debe tener 10 dígitos.",
    );
  });

  it("recordatorio: cliente existente o nuevo, no ambos ni ninguno", () => {
    const base = { targetDate: today, note: "Ajuste de talla" };
    expect(reminderSchema.safeParse({ ...base, clientId: "c1" }).success).toBe(true);
    expect(reminderSchema.safeParse({ ...base, newClient: { name: "Ana", phone: "5512345678" } }).success).toBe(true);
    expect(errorsOf(reminderSchema.safeParse(base)).clientId).toBe("Elige un cliente o captura uno nuevo.");
  });

  it("hora en formato 24 h", () => {
    const base = { targetDate: today, note: "x", clientId: "c1" };
    expect(reminderSchema.parse({ ...base, targetTime: "23:00" }).targetTime).toBe("23:00");
    expect(reminderSchema.safeParse({ ...base, targetTime: "11pm" }).success).toBe(false);
  });
});
