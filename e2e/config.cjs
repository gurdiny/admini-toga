// Configuración de las pruebas de punta a punta (E2E). Ver e2e/README.md.
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const B = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const dir = path.join(__dirname, "screenshots");
fs.mkdirSync(dir, { recursive: true });

module.exports = {
  CHROME,
  B,
  shots: (name) => path.join(dir, name),
  log: (ok, msg) => {
    if (!ok) process.exitCode = 1;
    console.log(`${ok ? "✓" : "✗"} ${msg}`);
  },
};
