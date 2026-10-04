const { chromium } = require("playwright-core");
const { CHROME, B, shots, log } = require("./config.cjs");
const balance = async (page) => (await page.locator("#saldo + span").innerText()).trim();

/** Cuántos pagos se pueden editar/borrar: todos tienen menú (Ver detalle), no todos tienen «Borrar». */
async function editablePayments(page) {
  const menus = page.getByRole("button", { name: /Opciones de PAG-/ });
  let editable = 0;
  for (let i = 0; i < (await menus.count()); i++) {
    await menus.nth(i).click();
    await page.getByRole("menuitem", { name: "Ver detalle" }).waitFor();
    if (await page.getByRole("menuitem", { name: "Borrar" }).isVisible()) editable++;
    await page.keyboard.press("Escape");
    await page.getByRole("menu").waitFor({ state: "hidden" });
  }
  return { editable, total: await menus.count() };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 }, locale: "es-MX" });
  page.setDefaultTimeout(15000);
  try {
    // ── Mostrador da de alta un proveedor que ya le debe ──
    await page.goto(`${B}/api/dev/login?as=mostrador@joyeria.local&next=/proveedores`);
    await page.waitForLoadState("networkidle"); // que React hidrate antes de hacer clic
    log((await page.getByText("Mostrador", { exact: true }).count()) > 0, "Entra como Mostrador");
    await page.getByRole("button", { name: "Nuevo proveedor" }).first().click();
    await page.getByLabel("Nombre").fill("Joyería Prueba E2E");
    await page.getByLabel("Teléfono").fill("(55) 9876-5432");
    await page.getByText("Tiene WhatsApp").click();
    await page.getByText("Ya le debo").click();
    await page.getByLabel("Monto que le debo").fill("50000");
    await page.screenshot({ path: shots("e2e-1-alta.png"), fullPage: true });
    await page.getByRole("button", { name: "Dar de alta" }).click();
    await page.waitForURL(/\/proveedores\/[^/]+$/);
    log((await balance(page)) === "$50,000.00", `Alta con saldo inicial → le debes ${await balance(page)}`);
    log((await page.getByRole("link", { name: "WhatsApp" }).getAttribute("href")) === "https://wa.me/525598765432", "WhatsApp con teléfono normalizado");

    // ── Abono de 20 mil ──
    const abonar = async (amount, { liquidar = false } = {}) => {
      await page.getByRole("button", { name: "Abonar" }).first().click();
      const dialog = page.getByRole("dialog");
      if (liquidar) await dialog.getByRole("button", { name: /Liquidar/ }).click();
      else await dialog.getByLabel("Monto").fill(amount);
      await dialog.getByRole("combobox", { name: "Categoría" }).click();
      await page.getByRole("option", { name: "Pulseras" }).click();
      return dialog;
    };
    let dialog = await abonar("20000");
    log(await dialog.getByText("Después de este abono quedará: $30,000.00").isVisible(), "Vista previa: quedará $30,000.00");
    await dialog.getByRole("button", { name: "Registrar pago" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByText("$30,000.00").first().waitFor();
    log((await balance(page)) === "$30,000.00", `Abono de $20,000 → le debes ${await balance(page)}`);

    // ── Abono mayor al saldo ──
    dialog = await abonar("40000");
    log(await dialog.getByText("Excede el saldo por $10,000.00").isVisible(), "Aviso en el formulario: excede por $10,000.00");
    await dialog.getByRole("button", { name: "Registrar pago" }).click();
    const toast = page.getByRole("dialog").getByText(/El abono es mayor que el saldo de ADE-\d+: quedan \$30,000\.00/);
    await toast.waitFor();
    log(true, `Servidor lo rechaza: «${(await toast.innerText()).trim()}»`);
    await page.screenshot({ path: shots("e2e-2-excede.png"), fullPage: true });
    await page.keyboard.press("Escape");

    // ── Liquidar ──
    dialog = await abonar(null, { liquidar: true });
    log(await dialog.getByText("Con este abono queda liquidado.").isVisible(), "Botón Liquidar llena $30,000.00");
    await dialog.getByRole("button", { name: "Registrar pago" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByText("Al corriente").first().waitFor();
    log((await balance(page)) === "Al corriente", "Liquidado → Al corriente");

    // ── Otro préstamo ──
    await page.getByRole("button", { name: "Nuevo adeudo" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Descripción").fill("Lote de 30 dijes");
    await dialog.getByLabel("Monto total").fill("3000");
    await dialog.getByRole("button", { name: "Registrar adeudo" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByText("$3,000.00").first().waitFor();
    log((await balance(page)) === "$3,000.00", "Nuevo adeudo de $3,000 → le debes $3,000.00");

    // ── Borrar un abono propio de hoy ──
    await page.getByRole("button", { name: /Opciones de PAG-/ }).first().click();
    await page.getByRole("menuitem", { name: "Borrar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Borrar" }).click();
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    await page.waitForTimeout(800);
    log((await balance(page)) === "$33,000.00", `Borrar el abono de liquidación → le debes ${await balance(page)}`);
    log((await page.getByRole("button", { name: "Desactivar" }).count()) === 0, "Mostrador no ve «Desactivar»");
    await page.screenshot({ path: shots("e2e-3-final.png"), fullPage: true });

    // ── Permisos sobre registros de otros / de días anteriores ──
    await page.goto(`${B}/proveedores`);
    await page.waitForLoadState("networkidle"); // que React hidrate antes de hacer clic
    await page.getByRole("link", { name: /Platería Taxco Hernández/ }).click();
    await page.getByRole("heading", { name: "Platería Taxco Hernández" }).waitFor();
    const staffView = await editablePayments(page);
    // Los 2 que capturó hoy sí; los del dueño o de otros días, no (la cantidad total depende de los datos).
    log(staffView.editable >= 2 && staffView.editable < staffView.total, `Taxco: el Mostrador edita/borra solo lo suyo de hoy (${staffView.editable} de ${staffView.total}); todos tienen «Ver detalle»`);

    // ── Dueño ──
    await page.goto(`${B}/api/dev/login?as=dueno@joyeria.local&next=/proveedores`);
    await page.waitForLoadState("networkidle"); // que React hidrate antes de hacer clic
    await page.getByRole("link", { name: /Platería Taxco Hernández/ }).click();
    await page.getByRole("heading", { name: "Platería Taxco Hernández" }).waitFor();
    const ownerView = await editablePayments(page);
    log(ownerView.editable === ownerView.total, `Dueño puede editar/borrar todos (${ownerView.editable} de ${ownerView.total})`);
    log((await page.getByRole("button", { name: "Desactivar" }).count()) === 1, "Dueño ve «Desactivar»");
  } catch (error) {
    console.log("✗ FALLÓ:", error.message.split("\n")[0]);
    await page.screenshot({ path: shots("e2e-error.png"), fullPage: true });
  } finally {
    await browser.close();
  }
})();
