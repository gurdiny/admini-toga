// Instalación en producción (base vacía) y rescate del dueño.
//
//   docker exec -it toga-app node setup.mjs                  # pregunta nombre, correo y contraseña
//   docker exec -it toga-app node setup.mjs --email gera@toga.mx --name "Gera Urias"
//
// - Carga las categorías y la configuración base si no existen (no pisa lo
//   que el dueño haya cambiado en /admin). Sin datos de ejemplo.
// - Crea el usuario OWNER. Si el correo ya existe, lo deja como OWNER activo,
//   le pone la contraseña nueva y cierra sus sesiones (sirve para recuperar
//   el acceso si el dueño olvidó su contraseña).
// - La contraseña se pide sin mostrarse; para pruebas automáticas se puede
//   pasar en SETUP_PASSWORD.
//
// En la imagen de Docker va empaquetado como /app/setup.mjs (ver Dockerfile).
// En local: npx tsx --conditions=react-server prisma/setup.ts
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { parseArgs } from "node:util";
import { hashPassword } from "better-auth/crypto";
import { recordAudit } from "../src/lib/audit";
import { db } from "../src/lib/db";
import { toNameKey } from "../src/lib/normalize";
import { DEFAULT_SETTINGS, PAYMENT_CATEGORIES, SUPPLIER_CATEGORIES } from "./defaults";

const MIN_PASSWORD = 8; // igual que Better Auth (src/lib/auth/config.ts)
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pregunta en la terminal; con `hidden` no se ve lo que se escribe. */
async function ask(question: string, hidden = false): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, done) {
      if (!muted) process.stdout.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const answer = rl.question(question);
  muted = hidden;
  const value = await answer;
  rl.close();
  if (hidden) process.stdout.write("\n");
  return value.trim();
}

async function askPassword(): Promise<string> {
  if (process.env.SETUP_PASSWORD) return process.env.SETUP_PASSWORD;
  for (;;) {
    const password = await ask(`Contraseña (mínimo ${MIN_PASSWORD} caracteres): `, true);
    if (password.length < MIN_PASSWORD) {
      console.log(`  Muy corta. Usa al menos ${MIN_PASSWORD} caracteres.`);
      continue;
    }
    if ((await ask("Repite la contraseña: ", true)) === password) return password;
    console.log("  No coinciden. Intenta de nuevo.");
  }
}

async function loadCatalogs() {
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
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const exists = await db.appSetting.findUnique({ where: { key } });
    if (!exists) {
      await db.appSetting.create({ data: { key, value } });
      created++;
    }
  }
  console.log(created ? `✓ Catálogos base: ${created} registros nuevos.` : "✓ Catálogos base: ya estaban.");
}

async function upsertOwner(name: string, email: string, password: string) {
  const hash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) {
      const user = await tx.user.update({ where: { id: existing.id }, data: { name, role: "OWNER", isActive: true } });
      const account = await tx.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
      if (account) await tx.account.update({ where: { id: account.id }, data: { password: hash } });
      else await tx.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password: hash } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      // Solo queda constancia de que cambió, nunca el hash.
      await recordAudit(tx, {
        userId: user.id,
        action: "UPDATE",
        entity: "User",
        before: { ...existing, password: "anterior" },
        after: { ...user, password: "cambiada" },
      });
      console.log(`✓ ${email} ya existía: ahora es dueño activo con la contraseña nueva. Sus sesiones se cerraron.`);
      return;
    }
    const user = await tx.user.create({ data: { name, email, role: "OWNER", emailVerified: true } });
    await tx.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password: hash } });
    await recordAudit(tx, { userId: user.id, action: "CREATE", entity: "User", after: user });
    console.log(`✓ Dueño creado: ${name} <${email}>.`);
  });
}

async function main() {
  const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" } } });
  console.log("Instalación de TOGA: catálogos base y usuario dueño.\n");
  await loadCatalogs();

  const name = values.name?.trim() || (await ask("Nombre del dueño: "));
  const email = (values.email?.trim() || (await ask("Correo para entrar: "))).toLowerCase();
  if (!name) throw new Error("Falta el nombre.");
  if (!EMAIL.test(email)) throw new Error(`«${email}» no parece un correo válido.`);
  await upsertOwner(name, email, await askPassword());
  console.log("\nListo. Entra a la app con ese correo; al personal del mostrador se le da de alta en Admin → Usuarios.");
}

main()
  .catch((error: unknown) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
