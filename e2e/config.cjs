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

module.exports = {
  pickDay,
  CHROME,
  B,
  shots: (name) => path.join(dir, name),
  log: (ok, msg) => {
    if (!ok) process.exitCode = 1;
    console.log(`${ok ? "✓" : "✗"} ${msg}`);
  },
};
