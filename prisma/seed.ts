// Datos de ejemplo para desarrollo: `npm run db:seed`.
// Es idempotente: catálogos y usuarios se actualizan con upsert, y los
// registros de ejemplo (pagos, clientes, pedidos) solo se crean si la base
// todavía no tiene pagos.
import "dotenv/config";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/lib/db";
import { addDays, dayToDb, getToday } from "../src/lib/date";
import { normalizePhoneMX, toNameKey } from "../src/lib/normalize";
import { Prisma } from "../src/generated/prisma/client";
import { DEFAULT_SETTINGS, PAYMENT_CATEGORIES, SUPPLIER_CATEGORIES } from "./defaults";

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
  const payCat: Record<string, string> = {};
  for (const [i, [name, color]] of PAYMENT_CATEGORIES.entries()) {
    payCat[name] = (await upsertCategory(name, "PAYMENT", color, i)).id;
  }
  const supCat: Record<string, string> = {};
  for (const [i, [name, color]] of SUPPLIER_CATEGORIES.entries()) {
    supCat[name] = (await upsertCategory(name, "SUPPLIER", color, i)).id;
  }

  // ─── Proveedores ───────────────────────────────────────────────────────
  // Contacto variado a propósito: hay proveedores sin teléfono ni WhatsApp.
  // Qué se le paga a cada uno: los que entregan piezas terminadas cobran metal
  // y hechura; los talleres de engaste y pulido solo hechura.
  const suppliers = [
    ["Platería Taxco Hernández", "Joyería", true, true, "Don Ernesto", "55 1234 5678", true],
    ["Cadenas y Eslabones del Centro", "Joyería", true, true, "Sra. Marisol", "55 2345 6789", false],
    ["Aretes y Dijes Guadalajara", "Joyería", true, true, null, "33 3456 7890", true],
    ["Taller de Engaste Ruiz", "Mano de obra", false, true, "Lupita Ruiz", null, false],
    ["Soldadura y Pulido Méndez", "Mano de obra", false, true, null, null, false],
  ] as const;
  const sup: Record<string, string> = {};
  for (const [name, category, chargesMetal, chargesLabor, contactName, phone, hasWhatsApp] of suppliers) {
    const nameKey = toNameKey(name);
    const data = {
      name,
      categoryId: supCat[category],
      chargesMetal,
      chargesLabor,
      contactName,
      phone: normalizePhoneMX(phone),
      hasWhatsApp,
    };
    sup[name] = (
      await db.supplier.upsert({ where: { nameKey }, update: data, create: { ...data, nameKey } })
    ).id;
  }

  // ─── Configuración ─────────────────────────────────────────────────────
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.appSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  // ─── Registros de ejemplo (solo en base vacía) ─────────────────────────
  if ((await db.supplierPayment.count()) > 0) {
    console.log("Ya hay pagos: se omiten los registros de ejemplo.");
    return;
  }

  const clients = [
    ["María Fernanda López", "55 8765 4321"],
    ["Carlos Méndez", "55 7654 3210"],
    ["Ana Sofía Torres", "55 6543 2109"],
    ["Roberto García", "55 5432 1098"],
  ] as const;
  const cli: string[] = [];
  for (const [name, phone] of clients) {
    const client = await db.client.create({
      data: { name, nameKey: toNameKey(name), phone: normalizePhoneMX(phone) },
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
    { key: "taxco-inicial", day: -40, supplier: "Platería Taxco Hernández", kind: "OPENING_BALANCE", category: "Anillos", description: "Saldo pendiente al dar de alta al proveedor", metal: "38000.00", labor: "12000.00", ref: null, due: null },
    { key: "cadenas-lote", day: -10, supplier: "Cadenas y Eslabones del Centro", kind: "CREDIT", category: "Cadenas", description: "Lote de 40 cadenas de plata .925", metal: "20000.00", labor: "5000.00", ref: "NR-2231", due: 20 },
    { key: "aretes-argollas", day: -6, supplier: "Aretes y Dijes Guadalajara", kind: "CREDIT", category: "Aretes", description: "12 pares de argollas de plata", metal: "950.00", labor: "0", ref: null, due: null },
    { key: "aretes-dijes", day: -2, supplier: "Aretes y Dijes Guadalajara", kind: "CREDIT", category: "Dijes", description: "Lote de 30 dijes de plata", metal: "2400.00", labor: "600.00", ref: "F-118", due: 15 },
    // Un taller que solo cobra hechura: su nota no lleva renglón de metal.
    { key: "engaste-lote", day: -5, supplier: "Taller de Engaste Ruiz", kind: "CREDIT", category: "Anillos", description: "Engaste de circonias en 40 anillos", metal: "0", labor: "4500.00", ref: null, due: 10 },
  ] as const;
  const debt: Record<string, string> = {};
  for (const d of debts) {
    const created = await db.supplierDebt.create({
      data: {
        supplierId: sup[d.supplier],
        kind: d.kind,
        date: mxDay(d.day),
        description: d.description,
        amount: new Prisma.Decimal(d.metal).add(d.labor),
        amountMetal: new Prisma.Decimal(d.metal),
        amountLabor: new Prisma.Decimal(d.labor),
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
    { day: -35, supplier: "Platería Taxco Hernández", category: "Anillos", concept: "Abono a saldo inicial", metal: "18000.00", labor: "3400.00", method: "EFECTIVO", debt: "taxco-inicial", order: null },
    { day: -1, supplier: "Platería Taxco Hernández", category: "Pulseras", concept: "Abono a saldo inicial", metal: "1450.50", labor: "0", method: "EFECTIVO", debt: "taxco-inicial", order: 1 },
    { day: 0, supplier: "Platería Taxco Hernández", category: "Anillos", concept: "Abono: anillo de compromiso", metal: "10000.00", labor: "2850.00", method: "TRANSFERENCIA", debt: "taxco-inicial", order: 0 },
    { day: -4, supplier: "Cadenas y Eslabones del Centro", category: "Cadenas", concept: "Anticipo lote de cadenas", metal: "15000.00", labor: "3500.00", method: "EFECTIVO", debt: "cadenas-lote", order: null },
    { day: -3, supplier: "Aretes y Dijes Guadalajara", category: "Aretes", concept: "Liquidación argollas", metal: "950.00", labor: "0", method: "EFECTIVO", debt: "aretes-argollas", order: null },
    { day: -2, supplier: "Taller de Engaste Ruiz", category: "Anillos", concept: "Abono al engaste de anillos", metal: "0", labor: "1500.00", method: "EFECTIVO", debt: "engaste-lote", order: null },
    { day: 0, supplier: "Taller de Engaste Ruiz", category: "Anillos", concept: "Engaste de circonias en anillo", metal: "0", labor: "1800.00", method: "EFECTIVO", debt: null, order: 0 },
    { day: -1, supplier: "Soldadura y Pulido Méndez", category: "Cadenas", concept: "Soldadura de 8 cadenas", metal: "0", labor: "640.00", method: "EFECTIVO", debt: null, order: null },
    { day: -12, supplier: "Taller de Engaste Ruiz", category: "Otros", concept: "Grabado de 5 placas", metal: "0", labor: "750.00", method: "EFECTIVO", debt: null, order: 1 },
    { day: -20, supplier: "Soldadura y Pulido Méndez", category: "Otros", concept: "Pulido de 30 piezas", metal: "0", labor: "900.00", method: "EFECTIVO", debt: null, order: null },
    { day: -8, supplier: "Cadenas y Eslabones del Centro", category: "Cadenas", concept: "Abono lote de cadenas", metal: "3000.00", labor: "0", method: "EFECTIVO", debt: "cadenas-lote", order: null },
  ] as const;
  for (const p of payments) {
    await db.supplierPayment.create({
      data: {
        date: mxDay(p.day),
        supplierId: sup[p.supplier],
        categoryId: payCat[p.category],
        concept: p.concept,
        amount: new Prisma.Decimal(p.metal).add(p.labor),
        amountMetal: new Prisma.Decimal(p.metal),
        amountLabor: new Prisma.Decimal(p.labor),
        paymentMethod: p.method,
        debtId: p.debt === null ? null : debt[p.debt],
        orderId: p.order === null ? null : orders[p.order],
        createdById: p.day < -10 ? owner.id : staff.id,
      },
    });
  }

  console.log(
    `Seed listo: 2 usuarios, ${PAYMENT_CATEGORIES.length + SUPPLIER_CATEGORIES.length} categorías, ` +
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
