// Fase 7 en celular (390 px): búsqueda global (folio → cliente en < 2 s),
// historial del cliente con pago ligado al pedido (se conserva al editar),
// exportación a Excel/CSV con permisos y el Inicio de cada rol.
const fs = require("fs");
const { chromium } = require("playwright-core");
const { CHROME, B, shots, log } = require("./config.cjs");

const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-MX", acceptDownloads: true };
const CLIENT = `Cliente E2E Reportes ${Date.now() % 100000}`;
const NOTE = "E2E pedido de reporte: anillo de plata talla 7";
const CONCEPT = "E2E costo del pedido";

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const staff = await (await browser.newContext(MOBILE)).newPage();
  const owner = await (await browser.newContext(MOBILE)).newPage();
  for (const page of [staff, owner]) page.setDefaultTimeout(15000);
  const go = async (page, path) => {
    await page.goto(`${B}${path}`);
    await page.waitForLoadState("networkidle");
  };
  const searchDialog = (page) => page.getByRole("dialog", { name: "Buscar" });

  try {
    await go(staff, "/api/dev/login?as=mostrador@joyeria.local&next=/");
    await go(owner, "/api/dev/login?as=dueno@joyeria.local&next=/");

    // ─── Inicio por rol ─────────────────────────────────────────────────
    log(await owner.getByRole("heading", { name: "Gasto por categoría" }).isVisible(), "dueño: Inicio con gasto por categoría del mes");
    log((await staff.getByText("Gasto por categoría").count()) === 0 && (await staff.getByText(/Pagado en/).count()) === 0, "mostrador: Inicio sin montos");
    log(await staff.getByRole("heading", { name: "Para hoy" }).isVisible(), "mostrador: Inicio con pendientes de hoy");

    // ─── Pedido nuevo con cliente nuevo (mostrador) ─────────────────────
    await go(staff, "/recordatorios");
    await staff.getByRole("button", { name: "Nuevo recordatorio" }).locator("visible=true").first().click();
    const form = staff.getByRole("dialog", { name: "Nuevo recordatorio" });
    await form.getByPlaceholder("Nombre, folio o teléfono").fill(CLIENT);
    await form.getByRole("button", { name: `Cliente nuevo «${CLIENT}»` }).click();
    await form.getByLabel("Teléfono (WhatsApp)").fill("5512340077");
    await form.getByLabel("¿Qué hay que hacer?").fill(NOTE);
    await form.getByRole("button", { name: "Guardar recordatorio" }).click();
    await form.waitFor({ state: "hidden" });

    // ─── Búsqueda global por nombre (mostrador, con la lupa) ────────────
    await staff.getByRole("button", { name: "Buscar" }).click();
    await searchDialog(staff).getByRole("combobox").fill(CLIENT);
    await searchDialog(staff).getByRole("option", { name: new RegExp(CLIENT) }).click();
    await staff.waitForURL(/\/clientes\//);
    await staff.waitForLoadState("networkidle");
    const folio = (await staff.getByText(/Folio CLI-\d+/).innerText()).match(/CLI-\d+/)[0];
    log(await staff.getByRole("heading", { name: CLIENT }).isVisible(), `mostrador: la búsqueda llega a la ficha del cliente (${folio})`);
    log(await staff.getByText(NOTE).isVisible(), "ficha: muestra el pedido");
    log((await staff.getByText("Costo", { exact: true }).count()) === 0, "mostrador: la ficha no muestra el costo total");
    const clientUrl = staff.url();

    // ─── Pago ligado al pedido (mostrador) ──────────────────────────────
    await staff.getByRole("button", { name: "Registrar pago de este pedido" }).click();
    const pay = staff.getByRole("dialog", { name: "Registrar pago del pedido" });
    log(await pay.getByText(`${CLIENT} ·`).isVisible(), "el pago trae el pedido elegido");
    await pay.getByLabel("Proveedor").fill("Taller");
    await pay.getByRole("button", { name: /^Taller/ }).first().click();
    await pay.getByRole("radio", { name: /Pago de contado/ }).click();
    await pay.getByLabel("Monto").fill("100");
    await pay.getByLabel("Concepto").fill(CONCEPT);
    await pay.getByLabel("Categoría").click();
    await staff.getByRole("option", { name: "Mano de obra" }).click();
    await pay.getByRole("button", { name: "Registrar pago" }).click();
    await pay.waitFor({ state: "hidden" });
    await staff.getByText(CONCEPT).waitFor();
    log(true, "mostrador: el pago aparece bajo el pedido");
    await staff.screenshot({ path: shots("e2e-reportes-cliente.png"), fullPage: true });

    // ─── Búsqueda por folio en menos de 2 s (dueño, ⌘K) ─────────────────
    await go(owner, "/pagos");
    await owner.keyboard.press("Control+k");
    const box = searchDialog(owner).getByRole("combobox");
    await box.waitFor();
    const start = Date.now();
    await box.fill(folio);
    await searchDialog(owner).getByRole("option", { name: new RegExp(CLIENT) }).waitFor();
    const found = Date.now() - start;
    await owner.keyboard.press("Enter");
    await owner.waitForURL(/\/clientes\//);
    await owner.getByRole("heading", { name: CLIENT }).waitFor();
    log(found < 2000, `dueño: ${folio} con Ctrl+K y Enter llega al cliente (${found} ms)`);
    await owner.waitForLoadState("networkidle");
    log(await owner.getByText("$100.00").first().isVisible(), "dueño: la ficha muestra el costo del pedido");

    // ─── El pedido se conserva al editar el pago (dueño) ────────────────
    await go(owner, `/pagos?rango=mes&q=${encodeURIComponent(CONCEPT)}`);
    await owner.getByRole("button", { name: /Opciones de PAG-/ }).locator("visible=true").first().click();
    await owner.getByRole("menuitem", { name: "Ver detalle" }).click();
    const detail = owner.getByRole("dialog", { name: /Pago PAG-/ });
    log(await detail.getByRole("link", { name: new RegExp(CLIENT) }).isVisible(), "detalle del pago: enlace al pedido del cliente");
    await detail.getByRole("button", { name: "Editar" }).click();
    const edit = owner.getByRole("dialog", { name: /Editar PAG-/ });
    log(await edit.getByText(`${CLIENT} ·`).isVisible(), "editar pago: muestra el pedido");
    await edit.getByLabel("Monto").fill("120");
    await edit.getByRole("button", { name: "Guardar cambios" }).click();
    await edit.waitFor({ state: "hidden" });
    await go(owner, new URL(clientUrl).pathname);
    log(await owner.getByText("$120.00").first().isVisible(), "tras editar, el pago sigue ligado al pedido");

    // ─── Exportar pagos (dueño) ──────────────────────────────────────────
    await go(owner, `/pagos?rango=mes&q=${encodeURIComponent(CONCEPT)}`);
    await owner.getByRole("button", { name: "Exportar" }).click();
    let [download] = await Promise.all([owner.waitForEvent("download"), owner.getByRole("menuitem", { name: /Excel/ }).click()]);
    const xlsxName = download.suggestedFilename();
    const xlsx = fs.readFileSync(await download.path());
    log(/^pagos_\d{4}-\d{2}-01_a_\d{4}-\d{2}-\d{2}\.xlsx$/.test(xlsxName) && xlsx.subarray(0, 2).toString() === "PK", `dueño: descarga ${xlsxName}`);
    await owner.getByRole("button", { name: "Exportar" }).click();
    [download] = await Promise.all([owner.waitForEvent("download"), owner.getByRole("menuitem", { name: "CSV" }).click()]);
    const csv = fs.readFileSync(await download.path(), "utf8");
    const lines = csv.trim().split(/\r\n/);
    log(
      lines.length >= 2 &&
        lines.slice(1).every((line) => line.includes(CONCEPT)) &&
        lines.some((line) => line.includes(`${folio} ${CLIENT}`) && line.includes("120.00")),
      "CSV respeta la búsqueda: solo el pago E2E, con su pedido y monto",
    );

    // ─── Permisos de exportación (mostrador) ────────────────────────────
    await go(staff, "/pagos?rango=mes");
    log((await staff.getByRole("button", { name: "Exportar" }).count()) === 0, "mostrador: /pagos sin botón Exportar");
    const denied = await staff.request.get(`${B}/api/exportar/pagos?rango=mes`);
    log(denied.status() === 403, `mostrador: la ruta de exportar pagos responde ${denied.status()}`);
    await go(staff, `/recordatorios?q=${encodeURIComponent(CLIENT)}`);
    await staff.getByRole("button", { name: "Exportar" }).click();
    [download] = await Promise.all([staff.waitForEvent("download"), staff.getByRole("menuitem", { name: "CSV" }).click()]);
    const remindersCsv = fs.readFileSync(await download.path(), "utf8");
    log(remindersCsv.includes(NOTE) && remindersCsv.includes(folio) && remindersCsv.includes("Fecha compromiso"), "mostrador: exporta recordatorios de la búsqueda");
  } catch (error) {
    console.log("✗ FALLÓ:", error.message.split("\n")[0]);
    process.exitCode = 1;
    await staff.screenshot({ path: shots("e2e-reportes-error-mostrador.png") });
    await owner.screenshot({ path: shots("e2e-reportes-error-dueno.png") });
  } finally {
    await browser.close();
  }
})();
