// Datos de ejemplo para desarrollo: `npm run db:seed`.
// Es idempotente: catálogos y usuarios se actualizan con upsert, y los
// registros de ejemplo (pagos, clientes, pedidos) solo se crean si la base
// todavía no tiene pagos.
import "dotenv/config";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/lib/db";
import { addDays, dayToDb, getToday } from "../src/lib/date";
import { normalizeFolio, normalizePhoneMX, toNameKey } from "../src/lib/normalize";
import { Prisma } from "../src/generated/prisma/client";

// Contraseña de los usuarios de ejemplo. Solo para desarrollo.
const DEV_PASSWORD = process.env.SEED_PASSWORD ?? "joyeria-dev-2026";

/** Día calendario de México desplazado `offset` días, listo para una columna @db.Date. */
function mxDay(offset = 0): Date {
  return dayToDb(addDays(getToday(), offset));
}

async function upsertUser(email: string, name: string, role: "OWNER" | "STAFF") {
  const user = await db.user.upsert({
    where: { email },
    update: { name, role, isActive: true },
    create: { email, name, role, emailVerified: true },
  });

  // Igual que el registro de Better Auth: cuenta "credential" con el hash.
  const password = await hashPassword(DEV_PASSWORD);
  const account = await db.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });
  if (account) {
    await db.account.update({ where: { id: account.id }, data: { password } });
  } else {
    await db.account.create({
      data: { userId: user.id, accountId: user.id, providerId: "credential", password },
    });
  }
  return user;
}

async function upsertCategory(
  name: string,
  type: "SUPPLIER" | "PAYMENT",
  color: string,
  sortOrder: number,
) {
  const nameKey = toNameKey(name);
  return db.category.upsert({
    where: { type_nameKey: { type, nameKey } },
    update: { name, color, sortOrder },
    create: { name, nameKey, type, color, sortOrder },
  });
}

async function main() {
  // ─── Usuarios ──────────────────────────────────────────────────────────
  const owner = await upsertUser("dueno@joyeria.local", "Gera Urias", "OWNER");
  const staff = await upsertUser("mostrador@joyeria.local", "Mostrador", "STAFF");

  // ─── Categorías ────────────────────────────────────────────────────────
  // TOGA solo vende plata .925. De pago: qué se compró o qué trabajo se pagó.
  // De proveedor: si entrega piezas terminadas o hace mano de obra.
  const paymentCategories = [
    ["Anillos", "#c23d73"],
    ["Aretes", "#d67da1"],
    ["Pulseras", "#6671ba"],
    ["Cadenas", "#6a5acd"],
    ["Collares", "#4f6b24"],
    ["Dijes", "#90ac53"],
    ["Mano de obra", "#aa3a3e"],
    ["Otros", "#737373"],
  ] as const;
  const payCat: Record<string, string> = {};
  for (const [i, [name, color]] of paymentCategories.entries()) {
    payCat[name] = (await upsertCategory(name, "PAYMENT", color, i)).id;
  }

  const supplierCategories = [
    ["Joyería", "#c23d73"],
    ["Mano de obra", "#aa3a3e"],
  ] as const;
  const supCat: Record<string, string> = {};
  for (const [i, [name, color]] of supplierCategories.entries()) {
    supCat[name] = (await upsertCategory(name, "SUPPLIER", color, i)).id;
  }

  // ─── Proveedores ───────────────────────────────────────────────────────
  // Contacto variado a propósito: hay proveedores sin teléfono ni WhatsApp.
  const suppliers = [
    ["Platería Taxco Hernández", "Joyería", "Don Ernesto", "55 1234 5678", true],
    ["Cadenas y Eslabones del Centro", "Joyería", "Sra. Marisol", "55 2345 6789", false],
    ["Aretes y Dijes Guadalajara", "Joyería", null, "33 3456 7890", true],
    ["Taller de Engaste Ruiz", "Mano de obra", "Lupita Ruiz", null, false],
    ["Soldadura y Pulido Méndez", "Mano de obra", null, null, false],
  ] as const;
  const sup: Record<string, string> = {};
  for (const [name, category, contactName, phone, hasWhatsApp] of suppliers) {
    const nameKey = toNameKey(name);
    const data = {
      name,
      categoryId: supCat[category],
      contactName,
      phone: normalizePhoneMX(phone),
      hasWhatsApp,
    };
    sup[name] = (
      await db.supplier.upsert({ where: { nameKey }, update: data, create: { ...data, nameKey } })
    ).id;
  }

  // ─── Configuración ─────────────────────────────────────────────────────
  const settings: Record<string, Prisma.InputJsonValue> = {
    businessName: "TOGA Plata .925",
    defaultCurrency: "MXN",
    defaultPaymentMethod: "EFECTIVO", // casi todos los pagos son en efectivo
    overdueLookbackDays: 30,
    modules: { payments: true, reminders: true },
  };
  for (const [key, value] of Object.entries(settings)) {
    await db.appSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  // ─── Registros de ejemplo (solo en base vacía) ─────────────────────────
  if ((await db.supplierPayment.count()) > 0) {
    console.log("Ya hay pagos: se omiten los registros de ejemplo.");
    return;
  }

  const clients = [
    ["María Fernanda López", "55 8765 4321", "JOY-8492"],
    ["Carlos Méndez", "55 7654 3210", "JOY-8493"],
    ["Ana Sofía Torres", "55 6543 2109", "JOY-8494"],
    ["Roberto García", "55 5432 1098", null],
  ] as const;
  const cli: string[] = [];
  for (const [name, phone, folio] of clients) {
    const client = await db.client.create({
      data: { name, nameKey: toNameKey(name), phone: normalizePhoneMX(phone), folio: normalizeFolio(folio) },
    });
    cli.push(client.id);
  }

  const reminders = [
    { clientId: cli[0], targetDate: mxDay(1), targetTime: "11:00", note: "Anillo de compromiso plata .925, talla 6, con circonia.", priority: "ALTA" },
    { clientId: cli[1], targetDate: mxDay(1), targetTime: null, note: "Cadena de plata .925 con dije grabado: iniciales C.M.", priority: "NORMAL" },
    { clientId: cli[2], targetDate: mxDay(0), targetTime: "17:30", note: "Ajuste de talla de argolla, de 7 a 6.5.", priority: "NORMAL" },
    { clientId: cli[3], targetDate: mxDay(-2), targetTime: null, note: "Reparación de broche en pulsera de plata.", priority: "ALTA" },
    { clientId: cli[0], targetDate: mxDay(-5), targetTime: null, note: "Limpieza y pulido de aretes.", priority: "NORMAL", done: true },
  ] as const;
  const orders: string[] = [];
  for (const { done, ...r } of reminders.map((r) => ({ done: false, ...r }))) {
    const order = await db.orderReminder.create({
      data: {
        ...r,
        createdById: staff.id,
        ...(done && { isCompleted: true, completedAt: new Date(), completedById: staff.id }),
      },
    });
    orders.push(order.id);
  }

  // Adeudos: saldo inicial de un proveedor que ya se debía al empezar a usar
  // el sistema, un crédito ya liquidado seguido de uno nuevo, y uno a medias.
  const debts = [
    { key: "taxco-inicial", day: -40, supplier: "Platería Taxco Hernández", kind: "OPENING_BALANCE", category: "Anillos", description: "Saldo pendiente al dar de alta al proveedor", amount: "50000.00", ref: null, due: null },
    { key: "cadenas-lote", day: -10, supplier: "Cadenas y Eslabones del Centro", kind: "CREDIT", category: "Cadenas", description: "Lote de 40 cadenas de plata .925", amount: "25000.00", ref: "NR-2231", due: 20 },
    { key: "aretes-argollas", day: -6, supplier: "Aretes y Dijes Guadalajara", kind: "CREDIT", category: "Aretes", description: "12 pares de argollas de plata", amount: "950.00", ref: null, due: null },
    { key: "aretes-dijes", day: -2, supplier: "Aretes y Dijes Guadalajara", kind: "CREDIT", category: "Dijes", description: "Lote de 30 dijes de plata", amount: "3000.00", ref: "F-118", due: 15 },
  ] as const;
  const debt: Record<string, string> = {};
  for (const d of debts) {
    const created = await db.supplierDebt.create({
      data: {
        supplierId: sup[d.supplier],
        kind: d.kind,
        date: mxDay(d.day),
        description: d.description,
        amount: new Prisma.Decimal(d.amount),
        categoryId: payCat[d.category],
        supplierRef: d.ref,
        dueDate: d.due === null ? null : mxDay(d.due),
        createdById: owner.id,
      },
    });
    debt[d.key] = created.id;
  }

  // debt: null = pago de contado. Casi todo en efectivo, como en el negocio.
  const payments = [
    { day: -35, supplier: "Platería Taxco Hernández", category: "Anillos", concept: "Abono a saldo inicial", amount: "21400.00", method: "EFECTIVO", debt: "taxco-inicial", order: null },
    { day: -1, supplier: "Platería Taxco Hernández", category: "Pulseras", concept: "Abono a saldo inicial", amount: "1450.50", method: "EFECTIVO", debt: "taxco-inicial", order: 1 },
    { day: 0, supplier: "Platería Taxco Hernández", category: "Anillos", concept: "Abono: anillo de compromiso", amount: "12850.00", method: "TRANSFERENCIA", debt: "taxco-inicial", order: 0 },
    { day: -4, supplier: "Cadenas y Eslabones del Centro", category: "Cadenas", concept: "Anticipo lote de cadenas", amount: "18500.00", method: "EFECTIVO", debt: "cadenas-lote", order: null },
    { day: -3, supplier: "Aretes y Dijes Guadalajara", category: "Aretes", concept: "Liquidación argollas", amount: "950.00", method: "EFECTIVO", debt: "aretes-argollas", order: null },
    { day: 0, supplier: "Taller de Engaste Ruiz", category: "Mano de obra", concept: "Engaste de circonias en anillo", amount: "1800.00", method: "EFECTIVO", debt: null, order: 0 },
    { day: -1, supplier: "Soldadura y Pulido Méndez", category: "Mano de obra", concept: "Soldadura de 8 cadenas", amount: "640.00", method: "EFECTIVO", debt: null, order: null },
    { day: -12, supplier: "Taller de Engaste Ruiz", category: "Mano de obra", concept: "Grabado de 5 placas", amount: "750.00", method: "EFECTIVO", debt: null, order: 1 },
    { day: -20, supplier: "Soldadura y Pulido Méndez", category: "Mano de obra", concept: "Pulido de 30 piezas", amount: "900.00", method: "EFECTIVO", debt: null, order: null },
    { day: -8, supplier: "Cadenas y Eslabones del Centro", category: "Cadenas", concept: "Abono lote de cadenas", amount: "3000.00", method: "EFECTIVO", debt: "cadenas-lote", order: null },
  ] as const;
  for (const p of payments) {
    await db.supplierPayment.create({
      data: {
        date: mxDay(p.day),
        supplierId: sup[p.supplier],
        categoryId: payCat[p.category],
        concept: p.concept,
        amount: new Prisma.Decimal(p.amount),
        paymentMethod: p.method,
        debtId: p.debt === null ? null : debt[p.debt],
        orderId: p.order === null ? null : orders[p.order],
        createdById: p.day < -10 ? owner.id : staff.id,
      },
    });
  }

  console.log(
    `Seed listo: 2 usuarios, ${paymentCategories.length + supplierCategories.length} categorías, ` +
      `${suppliers.length} proveedores, ${clients.length} clientes, ${reminders.length} pedidos, ` +
      `${debts.length} adeudos, ${payments.length} pagos.`,
  );
  console.log(`Acceso: dueno@joyeria.local / mostrador@joyeria.local — contraseña: ${DEV_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
