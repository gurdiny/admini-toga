// Configuración de las pruebas de punta a punta (E2E). Ver e2e/README.md.
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const B = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const dir = path.join(__dirname, "screenshots");
fs.mkdirSync(dir, { recursive: true });

/**
 * Elige un día en el calendario de TOGA: abre el campo, avanza o retrocede de
 * mes hasta llegar y toca el día ("2026-09-24").
 */
async function pickDay(page, trigger, day) {
  await trigger.click();
  const month = page.locator("[data-month]");
  for (let i = 0; i < 24; i++) {
    const shown = await month.getAttribute("data-month");
    if (shown === day.slice(0, 7)) break;
    await page.getByRole("button", { name: shown > day.slice(0, 7) ? "Mes anterior" : "Mes siguiente" }).click();
  }
  await page.locator(`[data-day="${day}"]`).click();
}

/**
 * Consulta directa a la base de desarrollo (DATABASE_URL de .env), solo para
 * preparar lo que la interfaz no puede crear (p. ej. un pedido capturado ayer)
 * o revisar la auditoría. Nunca apuntar a producción.
 */
async function sql(text, params = []) {
  const url =
    process.env.DATABASE_URL ??
    fs
      .readFileSync(path.join(__dirname, "..", ".env"), "utf8")
      .match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)?.[1];
  const { Client } = require("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(text, params)).rows;
  } finally {
    await client.end();
  }
}

module.exports = {
  pickDay,
  sql,
  CHROME,
  B,
  shots: (name) => path.join(dir, name),
  log: (ok, msg) => {
    if (!ok) process.exitCode = 1;
    console.log(`${ok ? "✓" : "✗"} ${msg}`);
  },
};
