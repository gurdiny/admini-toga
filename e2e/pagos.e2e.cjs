const { chromium } = require("playwright-core");
const { CHROME, B, shots, log, pickDay } = require("./config.cjs");
const money = (text) => Number(text.replace(/[^\d.]/g, ""));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, locale: "es-MX" });
  page.setDefaultTimeout(15000);
  const kpi = async (label) => (await page.getByText(label, { exact: true }).locator("xpath=following-sibling::p[1]").innerText()).trim();

  async function registrar({ supplier, amount, concept, day }) {
    await page.getByRole("button", { name: "Registrar pago" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Registrar pago" });
    await dialog.getByRole("combobox", { name: "Proveedor" }).click();
    await page.getByPlaceholder("Nombre o código…").fill(supplier);
    await page.getByRole("option", { name: new RegExp(supplier) }).first().click();
    await dialog.getByText("Pago de contado", { exact: true }).click();
    await dialog.getByLabel("Monto").fill(String(amount));
    await dialog.getByLabel("Concepto").fill(concept);
    await dialog.getByRole("combobox", { name: "Categoría" }).click();
    await page.getByRole("option", { name: "Mano de obra" }).click();
    if (day === "ayer") await dialog.getByRole("button", { name: "Ayer" }).click();
    else if (typeof day === "string") await pickDay(page, dialog.getByLabel("Fecha del pago"), day);
    await dialog.getByRole("button", { name: "Registrar pago" }).click();
    await dialog.waitFor({ state: "hidden" });
  }

  try {
    await page.goto(`${B}/api/dev/login?as=dueno@joyeria.local&next=/pagos`);
    await page.waitForLoadState("networkidle"); // que React hidrate antes de hacer clic
    await page.getByRole("link", { name: "Esta semana" }).waitFor();
    const before = money(await kpi("Pagado esta semana"));
    const countBefore = Number(await kpi("Cantidad de pagos"));
    log(true, `Antes: pagado esta semana $${before} en ${countBefore} pagos`);

    // Tres pagos de días distintos: hoy, ayer y hace 10 días (fuera de la semana)
    const tenDaysAgo = new Date(Date.now() - 10 * 864e5 - 6 * 36e5).toISOString().slice(0, 10);
    await registrar({ supplier: "Taller de Engaste", amount: 100, concept: "E2E pago de hoy", day: null });
    await registrar({ supplier: "Taller de Engaste", amount: 200, concept: "E2E pago de ayer", day: "ayer" });
    await registrar({ supplier: "Taller de Engaste", amount: 400, concept: "E2E pago fuera de semana", day: tenDaysAgo });
    await page.reload();
    await page.waitForLoadState("networkidle"); // que React hidrate antes de hacer clic
    const after = money(await kpi("Pagado esta semana"));
    log(Math.abs(after - before - 300) < 0.001, `«Esta semana» suma hoy + ayer (+$300) y excluye el de hace 10 días → $${after}`);
    log(Number(await kpi("Cantidad de pagos")) === countBefore + 2, "Cantidad de pagos +2");

    await page.getByRole("link", { name: "Hoy" }).click();
    await page.waitForURL(/rango=hoy/);
    log(await page.locator("table").getByText("E2E pago de hoy").isVisible() && (await page.getByText("E2E pago de ayer").count()) === 0, "«Hoy» muestra solo el de hoy; la URL guarda el filtro (?rango=hoy)");
    await page.reload();
    await page.waitForLoadState("networkidle"); // que React hidrate antes de hacer clic
    log(await page.getByRole("link", { name: "Hoy" }).getAttribute("aria-current") === "true", "Al recargar sigue en «Hoy»");

    // Proveedor nuevo desde el buscador del formulario
    await page.getByRole("button", { name: "Registrar pago" }).first().click();
    let dialog = page.getByRole("dialog", { name: "Registrar pago" });
    await dialog.getByRole("combobox", { name: "Proveedor" }).click();
    await page.getByPlaceholder("Nombre o código…").fill("Orfebrería Nueva E2E");
    await page.getByRole("option", { name: /Dar de alta «Orfebrería Nueva E2E»/ }).click();
    const supplierDialog = page.getByRole("dialog").filter({ hasText: "Nuevo proveedor" });
    log((await supplierDialog.getByLabel("Nombre").inputValue()) === "Orfebrería Nueva E2E", "Alta en línea con el nombre ya escrito");
    await supplierDialog.getByRole("button", { name: "Dar de alta" }).click();
    await supplierDialog.waitFor({ state: "hidden" });
    dialog = page.getByRole("dialog", { name: "Registrar pago" });
    log((await dialog.getByRole("combobox", { name: "Proveedor" }).innerText()).includes("Orfebrería Nueva E2E"), "Queda seleccionado en el pago");
    log(await dialog.getByText("Este proveedor no tiene adeudos abiertos.").isVisible(), "Sin adeudos → pago de contado");
    await dialog.getByLabel("Monto").fill("50");
    await dialog.getByLabel("Concepto").fill("E2E primer pago");
    await dialog.getByRole("combobox", { name: "Categoría" }).click();
    await page.getByRole("option", { name: "Mano de obra" }).click();
    await page.screenshot({ path: shots("e2e-pago-form.png") });
    await dialog.getByRole("button", { name: "Registrar pago" }).click();
    await dialog.waitFor({ state: "hidden" });
    log(await page.locator("table").getByText("E2E primer pago").isVisible(), "Pago al proveedor nuevo registrado");

    // Errores de validación visibles
    await page.getByRole("button", { name: "Registrar pago" }).first().click();
    dialog = page.getByRole("dialog", { name: "Registrar pago" });
    await dialog.getByRole("combobox", { name: "Proveedor" }).click();
    await page.getByRole("option", { name: /Taller de Engaste/ }).click();
    await dialog.getByText("Pago de contado", { exact: true }).click();
    await dialog.getByRole("button", { name: "Registrar pago" }).click();
    await dialog.getByText("Escribe un monto.").or(dialog.getByText("Escribe un monto válido, por ejemplo 1250.50.")).first().waitFor();
    log(await dialog.getByText("Falta el concepto.").isVisible(), "Sin monto ni concepto: errores junto a cada campo");
    await page.keyboard.press("Escape");

    // Buscar y ordenar
    // «E2E p» encuentra solo los pagos de esta prueba (no los de proveedores.e2e.cjs).
    await page.goto(`${B}/pagos?rango=semana&q=E2E+p&orden=amount&dir=asc`);
    await page.waitForLoadState("networkidle"); // que React hidrate antes de hacer clic
    const concepts = await page.locator("table tbody tr td:nth-child(3) span.block").allInnerTexts();
    log(concepts.join("|") === "E2E primer pago|E2E pago de hoy|E2E pago de ayer", `Buscar «E2E p» + ordenar por monto ↑ → ${concepts.join(", ")}`);

    // Borrar
    await page.getByRole("row", { name: /E2E pago de ayer/ }).getByRole("button", { name: /Opciones de PAG-/ }).click();
    await page.getByRole("menuitem", { name: "Borrar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Borrar" }).click();
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    await page.getByText("E2E pago de ayer").waitFor({ state: "detached" });
    log(true, "Borrar con confirmación → desaparece de la lista");

    // Mostrador: sin totales
    await page.goto(`${B}/api/dev/login?as=mostrador@joyeria.local&next=/pagos`);
    await page.waitForLoadState("networkidle"); // que React hidrate antes de hacer clic
    await page.getByRole("link", { name: "Esta semana" }).waitFor();
    log((await page.getByText("Pagado esta semana").count()) === 0 && (await page.getByText("Por categoría").count()) === 0, "Mostrador no ve totales ni desgloses");
    log(await page.locator("table").getByText("E2E pago de hoy").isVisible(), "Mostrador sí ve la lista con montos");
  } catch (error) {
    console.log("✗ FALLÓ:", error.message.split("\n")[0]);
    await page.screenshot({ path: shots("e2e-error.png"), fullPage: true });
  } finally {
    await browser.close();
  }
})();
