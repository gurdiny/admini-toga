import { describe, expect, it } from "vitest";
import { zodFieldErrors } from "@/lib/errors";
import { addDays, dayToDb, getToday } from "@/lib/date";
import { debtSchema, paymentSchema, supplierSchema, updatePaymentSchema } from "@/modules/payments/schemas";
import { clientSchema, reminderDayError, reminderSchema } from "@/modules/reminders/schemas";

const today = getToday();
const basePayment = {
  date: today,
  supplierId: "s1",
  categoryId: "c1",
  concept: "  10 g   plata .925 ",
  amountMetal: "1,250.50",
  paymentMethod: "EFECTIVO",
};

function errorsOf(result: { success: boolean; error?: unknown }) {
  return result.success ? {} : zodFieldErrors(result.error as never);
}

describe("pago", () => {
  it("normaliza monto y concepto", () => {
    const data = paymentSchema.parse(basePayment);
    expect(data.amount).toBe("1250.50");
    expect(data.concept).toBe("10 g plata .925");
    expect(data.currency).toBe("MXN");
    expect(data.debtId).toBeNull();
    expect(data.date).toEqual(dayToDb(today)); // listo para @db.Date
  });

  it("reparte el pago entre metal y mano de obra, y el total es la suma", () => {
    const data = paymentSchema.parse({ ...basePayment, amountMetal: "5,000", amountLabor: "1000" });
    expect(data).toMatchObject({ amountMetal: "5000.00", amountLabor: "1000.00", amount: "6000.00" });
  });

  it("un pago de pura mano de obra deja el metal en cero", () => {
    const data = paymentSchema.parse({ ...basePayment, amountMetal: "", amountLabor: "640" });
    expect(data).toMatchObject({ amountMetal: "0.00", amountLabor: "640.00", amount: "640.00" });
  });

  it("sin monto en ningún renglón no pasa", () => {
    const result = paymentSchema.safeParse({ ...basePayment, amountMetal: "", amountLabor: "0" });
    expect(errorsOf(result).amountMetal).toBe("Escribe cuánto es de metal, cuánto de mano de obra, o las dos cosas.");
  });

  it("monto negativo → mensaje legible", () => {
    const result = paymentSchema.safeParse({ ...basePayment, amountMetal: "-500" });
    expect(errorsOf(result).amountMetal).toBe("Escribe un monto válido, por ejemplo 1250.50.");
  });

  it("campos faltantes con mensaje que concuerda en género", () => {
    const errors = errorsOf(paymentSchema.safeParse({ ...basePayment, categoryId: undefined, concept: " " }));
    expect(errors.categoryId).toBe("Falta la categoría.");
    expect(errors.concept).toBe("Falta el concepto.");
  });

  it("texto en el monto no pasa", () => {
    expect(errorsOf(paymentSchema.safeParse({ ...basePayment, amountLabor: "mil pesos" })).amountLabor).toBeDefined();
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

  it("al editar, el id viaja junto con el reparto", () => {
    const data = updatePaymentSchema.parse({ ...basePayment, id: "p1", amountLabor: "250" });
    expect(data).toMatchObject({ id: "p1", amount: "1500.50" });
  });
});

describe("proveedor", () => {
  // Qué se le paga: el formulario llega con las dos casillas marcadas.
  const charges = { chargesMetal: "on", chargesLabor: "on" };

  it("además del nombre, solo hace falta qué se le paga", () => {
    const data = supplierSchema.parse({ name: "Fundición  Hernández ", ...charges });
    expect(data).toMatchObject({ name: "Fundición Hernández", phone: null, email: null, openingBalance: null });
  });

  it("exige marcar metal o mano de obra", () => {
    const result = supplierSchema.safeParse({ name: "X" });
    expect(errorsOf(result).chargesMetal).toBe("Marca al menos una: metal o mano de obra.");
  });

  it("acepta solo mano de obra (un engastador no entrega plata)", () => {
    const data = supplierSchema.parse({ name: "Taller Ruiz", chargesLabor: "on" });
    expect(data).toMatchObject({ chargesMetal: false, chargesLabor: true });
  });

  it("sin teléfono no puede tener WhatsApp", () => {
    expect(supplierSchema.parse({ name: "X", ...charges, hasWhatsApp: "on" }).hasWhatsApp).toBe(false);
    expect(supplierSchema.parse({ name: "X", ...charges, phone: "+52 55 1234 5678", hasWhatsApp: "on" })).toMatchObject({
      phone: "5512345678",
      hasWhatsApp: true,
    });
  });

  it("alta con saldo inicial", () => {
    const data = supplierSchema.parse({
      name: "X",
      ...charges,
      openingBalance: { amountMetal: "38,000", amountLabor: "12000", date: today },
    });
    expect(data.openingBalance).toEqual({
      amount: "50000.00",
      amountMetal: "38000.00",
      amountLabor: "12000.00",
      date: dayToDb(today),
      description: null,
    });
  });
});

describe("adeudo", () => {
  const baseDebt = { supplierId: "s1", date: today, description: "Lote", amountMetal: "3000" };

  it("la fecha límite no puede ser antes del adeudo", () => {
    const result = debtSchema.safeParse({ ...baseDebt, dueDate: addDays(today, -1) });
    expect(errorsOf(result).dueDate).toBeDefined();
  });

  it("la nota guarda sus dos renglones y el total", () => {
    const data = debtSchema.parse({ ...baseDebt, amountMetal: "20,000", amountLabor: "5000" });
    expect(data).toMatchObject({ amountMetal: "20000.00", amountLabor: "5000.00", amount: "25000.00" });
  });

  it("una nota de puro engaste no lleva metal", () => {
    const data = debtSchema.parse({ ...baseDebt, amountMetal: "", amountLabor: "4500" });
    expect(data).toMatchObject({ amountMetal: "0.00", amountLabor: "4500.00", amount: "4500.00" });
  });

  it("una nota sin monto en ningún renglón no pasa", () => {
    expect(errorsOf(debtSchema.safeParse({ ...baseDebt, amountMetal: "" })).amountMetal).toBe(
      "Escribe cuánto es de metal, cuánto de mano de obra, o las dos cosas.",
    );
  });
});

describe("cliente y recordatorio", () => {
  it("el cliente solo necesita el nombre; el folio no se captura (lo asigna la base)", () => {
    const client = clientSchema.parse({ name: "  María   López ", folio: "JOY-1" });
    expect(client).toEqual({ name: "María López", phone: null, notes: null });
  });

  it("fecha del recordatorio: nunca antes de hoy, salvo dejar la que ya tenía", () => {
    const yesterday = dayToDb(addDays(today, -1));
    expect(reminderDayError(dayToDb(today))).toBeNull();
    expect(reminderDayError(yesterday)).toBe("La fecha no puede ser anterior a hoy.");
    expect(reminderDayError(yesterday, yesterday)).toBeNull(); // editar uno atrasado sin moverlo
    expect(reminderDayError(dayToDb(addDays(today, -2)), yesterday)).toBe("La fecha no puede ser anterior a hoy.");
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
