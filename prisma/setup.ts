// Instalación en producción (base vacía) y rescate del dueño.
//
//   docker exec -it toga-app node setup.mjs                  # pregunta nombre y correo
//   docker exec -it toga-app node setup.mjs --email gera@toga.mx --name "Gera Urias"
//
// - Carga las categorías base si no existen (no pisa lo que el dueño haya
//   cambiado en /admin). Nada de datos de negocio: cero proveedores, pagos,
//   clientes y recordatorios. La configuración no necesita registros: la app
//   usa sus valores por defecto (src/lib/settings.ts) hasta que se guarde en
//   /admin/configuracion.
// - Crea el usuario OWNER. Si el correo ya existe, lo deja como OWNER activo,
//   le pone una contraseña nueva y cierra sus sesiones (para recuperar el
//   acceso si el dueño olvidó su contraseña).
// - La contraseña la GENERA el script y se imprime UNA sola vez en la terminal.
//   No se guarda en archivos, logs ni variables de entorno, ni en la auditoría
//   (solo el hash en Account.password, como cualquier usuario). Por eso se
//   niega a correr si la salida no es una terminal (p. ej. `> archivo`):
//   con `docker exec -it` la salida va a tu pantalla, no a `docker logs`.
//
// En la imagen de Docker va empaquetado como /app/setup.mjs (ver Dockerfile).
// En local: npx tsx --conditions=react-server prisma/setup.ts
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { hashPassword } from "better-auth/crypto";
import { recordAudit } from "../src/lib/audit";
import { db } from "../src/lib/db";
import { generatePassword } from "../src/lib/generate-password";
import { toNameKey } from "../src/lib/normalize";
import { PAYMENT_CATEGORIES, SUPPLIER_CATEGORIES } from "./defaults";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const value = await rl.question(question);
  rl.close();
  return value.trim();
}

/**
 * Categorías base. Las de pago son indispensables: cada pago exige una
 * (SupplierPayment.categoryId es obligatorio). Las de proveedor son opcionales
 * en el formulario, pero son la clasificación del negocio (joyería / mano de obra).
 */
async function loadCategories() {
  let created = 0;
  const categories = [
    ...PAYMENT_CATEGORIES.map(([name, color], i) => ({ name, color, sortOrder: i, type: "PAYMENT" as const })),
    ...SUPPLIER_CATEGORIES.map(([name, color], i) => ({ name, color, sortOrder: i, type: "SUPPLIER" as const })),
  ];
  for (const category of categories) {
    const nameKey = toNameKey(category.name);
    const exists = await db.category.findUnique({ where: { type_nameKey: { type: category.type, nameKey } } });
    if (!exists) {
      await db.category.create({ data: { ...category, nameKey } });
      created++;
    }
  }
  console.log(created ? `✓ Categorías base: ${created} nuevas.` : "✓ Categorías base: ya estaban.");
}

/** Crea al dueño o le pone una contraseña nueva. Devuelve si ya existía. */
async function upsertOwner(name: string, email: string, password: string): Promise<boolean> {
  const hash = await hashPassword(password);
  return db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) {
      const user = await tx.user.update({ where: { id: existing.id }, data: { name, role: "OWNER", isActive: true } });
      const account = await tx.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
      if (account) await tx.account.update({ where: { id: account.id }, data: { password: hash } });
      else await tx.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password: hash } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      // Solo queda constancia de que cambió, nunca la contraseña ni el hash.
      await recordAudit(tx, {
        userId: user.id,
        action: "UPDATE",
        entity: "User",
        before: { ...existing, password: "anterior" },
        after: { ...user, password: "cambiada" },
      });
      return true;
    }
    const user = await tx.user.create({ data: { name, email, role: "OWNER", emailVerified: true } });
    await tx.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password: hash } });
    await recordAudit(tx, { userId: user.id, action: "CREATE", entity: "User", after: user });
    return false;
  });
}

async function main() {
  if (!process.stdout.isTTY) {
    throw new Error("La contraseña solo se muestra en una terminal. Corre: docker exec -it toga-app node setup.mjs (sin redirigir la salida).");
  }
  const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" } } });
  console.log("Instalación de TOGA: categorías base y usuario dueño.\n");
  await loadCategories();

  const name = values.name?.trim() || (await ask("Nombre del dueño: "));
  const email = (values.email?.trim() || (await ask("Correo para entrar: "))).toLowerCase();
  if (!name) throw new Error("Falta el nombre.");
  if (!EMAIL.test(email)) throw new Error(`«${email}» no parece un correo válido.`);

  const password = generatePassword();
  const existed = await upsertOwner(name, email, password);
  console.log(
    existed
      ? `✓ ${email} ya existía: ahora es dueño activo con una contraseña nueva y sus sesiones se cerraron.`
      : `✓ Dueño creado: ${name} <${email}>.`,
  );
  // Única vez que se muestra. Solo va a esta terminal.
  process.stdout.write(
    [
      "",
      "  ┌──────────────────────────────────────────────┐",
      `  │  Contraseña: ${password.padEnd(32)}│`,
      "  └──────────────────────────────────────────────┘",
      "  Guárdala ahora en tu gestor de contraseñas: no se vuelve a mostrar.",
      "  Si se pierde, corre este comando otra vez con el mismo correo.",
      "",
      "Al personal del mostrador se le da de alta en la app: Admin → Usuarios.",
      "",
    ].join("\n"),
  );
}

main()
  .catch((error: unknown) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
