// Recordatorios en celular (390 px): pestañas, captura con cliente nuevo y
// existente, checkbox optimista, deshacer, permisos de Mostrador y Dueño.
const { chromium } = require("playwright-core");
const { CHROME, B, shots, log } = require("./config.cjs");

const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-MX" };
/** Día de México con desfase: "2026-10-03" para ayer. */
const mxDay = (offset) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  return new Date(Date.parse(`${today}T00:00:00Z`) + offset * 864e5).toISOString().slice(0, 10);
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const staff = await (await browser.newContext(MOBILE)).newPage();
  const owner = await (await browser.newContext(MOBILE)).newPage();
  for (const page of [staff, owner]) page.setDefaultTimeout(15000);

  const tabs = (page) => page.getByRole("navigation", { name: "Pestañas de recordatorios" });
  const count = async (page, label) => Number((await tabs(page).getByRole("link", { name: new RegExp(label) }).innerText()).match(/\d+/)[0]);
  const card = (page, text) => page.locator("li").filter({ has: page.getByRole("checkbox") }).filter({ hasText: text });
  const openTab = async (page, label) => {
    await tabs(page).getByRole("link", { name: new RegExp(label) }).click();
    await tabs(page).getByRole("link", { name: new RegExp(label) }).and(page.locator("[aria-current=page]")).waitFor();
  };

  // Esperar a que React hidrate antes de tocar botones (la primera compilación en dev tarda).
  const ready = (page) => page.waitForLoadState("networkidle");

  async function capture(page, { search, pick, newPhone, note, day, time, high }) {
    await ready(page);
    await page.getByRole("button", { name: "Nuevo recordatorio" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("Nombre, folio o teléfono").fill(search);
    if (pick) {
      await dialog.getByRole("button", { name: new RegExp(pick) }).click();
    } else {
      await dialog.getByRole("button", { name: `Cliente nuevo «${search}»` }).click();
      await dialog.getByLabel("Teléfono (WhatsApp)").fill(newPhone);
    }
    await dialog.getByLabel("¿Qué hay que hacer?").fill(note);
    if (day === "hoy") await dialog.getByRole("button", { name: "Hoy", exact: true }).click();
    else if (day) await dialog.getByLabel("¿Para cuándo?").fill(day);
    if (time) await dialog.getByLabel("Hora límite").fill(time);
    if (high) await dialog.getByRole("radio", { name: "Alta" }).click();
    return dialog;
  }
  const save = async (dialog) => {
    await dialog.getByRole("button", { name: "Guardar recordatorio" }).click();
    await dialog.waitFor({ state: "hidden" });
  };

  try {
    await staff.goto(`${B}/api/dev/login?as=mostrador@joyeria.local&next=/recordatorios`);
    await tabs(staff).waitFor();
    await ready(staff);
    const manana = tabs(staff).getByRole("link", { name: /Mañana/ });
    log((await manana.getAttribute("aria-current")) === "page", "«Mañana» es la pestaña por defecto");
    await staff.screenshot({ path: shots("e2e-rec-manana.png"), fullPage: true });
    const before = { hoy: await count(staff, "Hoy"), atrasados: await count(staff, "Atrasados") };

    // Validación
    let dialog = await (async () => {
      await staff.getByRole("button", { name: "Nuevo recordatorio" }).click();
      return staff.getByRole("dialog");
    })();
    log((await dialog.getByLabel("¿Para cuándo?").inputValue()) === mxDay(1), "La fecha arranca en mañana (día de México)");
    await dialog.getByRole("button", { name: "Guardar recordatorio" }).click();
    await dialog.getByText("Elige un cliente o captura uno nuevo.").waitFor();
    log(await dialog.getByText("Falta la nota.").isVisible(), "Sin cliente ni nota: errores junto a cada campo");
    await staff.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });

    // Cliente nuevo en línea, para hoy, prioridad alta
    dialog = await capture(staff, { search: "Lucía E2E", newPhone: "55 1111 2222", note: "E2E anillo talla 7", day: "hoy", time: "18:30", high: true });
    log((await dialog.getByLabel("Nombre del cliente").inputValue()) === "Lucía E2E", "Alta de cliente en línea con el nombre ya escrito");
    await staff.screenshot({ path: shots("e2e-rec-form.png") });
    await save(dialog);

    // Cliente existente buscado por folio, con fecha de ayer
    dialog = await capture(staff, { search: "joy-8492", pick: "María Fernanda López", note: "E2E limpieza de cadena", day: mxDay(-1) });
    await save(dialog);

    log((await count(staff, "Hoy")) === before.hoy + 1, `Contador «Hoy» +1 → ${await count(staff, "Hoy")}`);
    log((await count(staff, "Atrasados")) === before.atrasados + 1, "El de ayer cuenta en «Atrasados»");
    const atrasadosTab = tabs(staff).getByRole("link", { name: /Atrasados/ });
    log((await atrasadosTab.getAttribute("class")).includes("text-destructive"), "«Atrasados» se marca en rojo");

    const badge = await staff.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: /Recordatorios/ }).innerText();
    log(badge.includes(String((await count(staff, "Hoy")) + (await count(staff, "Atrasados")))), `Globo de la barra inferior = hoy + atrasados (${badge.replace(/\s+/g, " ")})`);

    await openTab(staff, "Atrasados");
    log(await card(staff, "E2E limpieza de cadena").getByText("JOY-8492").isVisible(), "Atrasados: tarjeta con folio del cliente existente");

    await openTab(staff, "Hoy");
    const a = card(staff, "E2E anillo talla 7");
    log(await a.getByText("Alta", { exact: true }).isVisible(), "Marca de prioridad ALTA");
    log(await a.getByText("antes de las 18:30").isVisible(), "Hora límite visible");
    const wa = await a.getByRole("link", { name: /WhatsApp a Lucía E2E/ }).getAttribute("href");
    log(wa === "https://wa.me/525511112222", `Teléfono abre WhatsApp → ${wa}`);
    const box = a.getByRole("checkbox");
    const size = await box.boundingBox();
    log(size.width >= 44 && size.height >= 44, `Checkbox de ${size.width}×${size.height} px`);
    await staff.screenshot({ path: shots("e2e-rec-hoy.png"), fullPage: true });

    // Checkbox optimista: el servidor tarda 1.5 s a propósito y la marca sale antes
    await staff.route("**/recordatorios**", async (route) => {
      if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await staff.evaluate(() => (window.__sinRecarga = true));
    const hoyAntes = await count(staff, "Hoy");
    const t0 = Date.now();
    await box.click();
    await staff.waitForFunction(
      () => [...document.querySelectorAll("[role=checkbox]")].some((el) => el.getAttribute("aria-label")?.includes("Desmarcar: Lucía E2E")),
      null,
      { timeout: 500 },
    );
    log(Date.now() - t0 < 1000, `Se marca al instante (${Date.now() - t0} ms, el servidor tarda 1500 ms)`);
    await a.waitFor({ state: "detached" });
    log((await count(staff, "Hoy")) === hoyAntes - 1, "Al confirmar, sale de «Hoy» y baja el contador");
    log(await staff.evaluate(() => window.__sinRecarga === true), "La página no se recargó");
    await staff.unroute("**/recordatorios**");

    await openTab(staff, "Completados");
    log(await card(staff, "E2E anillo talla 7").getByText(/Completado .* por /).isVisible(), "En «Completados» con quién y cuándo");
    await staff.getByRole("button", { name: "Deshacer" }).click();
    await card(staff, "E2E anillo talla 7").waitFor({ state: "detached" });
    await openTab(staff, "Hoy");
    log(await card(staff, "E2E anillo talla 7").isVisible(), "«Deshacer» lo regresa a «Hoy»");

    // El dueño captura uno: el mostrador no puede editarlo ni borrarlo
    await owner.goto(`${B}/api/dev/login?as=dueno@joyeria.local&next=${encodeURIComponent("/recordatorios?vista=hoy")}`);
    dialog = await capture(owner, { search: "lucia e2e", pick: "Lucía E2E", note: "E2E pedido del dueño", day: "hoy" });
    await save(dialog);
    await staff.reload();
    await ready(staff);
    log((await card(staff, "E2E pedido del dueño").getByRole("button", { name: /Opciones/ }).count()) === 0, "Mostrador: sin menú en lo que capturó el dueño");
    log((await card(staff, "E2E anillo talla 7").getByRole("button", { name: /Opciones/ }).count()) === 1, "Mostrador: sí puede corregir lo suyo de hoy");

    // Si la acción falla, el checkbox se revierte solo
    await owner.reload();
    await ready(owner);
    await card(owner, "E2E anillo talla 7").getByRole("button", { name: /Opciones/ }).click();
    await owner.getByRole("menuitem", { name: "Borrar" }).click();
    await owner.getByRole("alertdialog").getByRole("button", { name: "Borrar" }).click();
    await owner.getByRole("alertdialog").waitFor({ state: "hidden" });
    await card(staff, "E2E anillo talla 7").getByRole("checkbox").click(); // página vieja del mostrador
    await staff.getByText("El recordatorio ya no existe. Recarga la página.").waitFor();
    log((await card(staff, "E2E anillo talla 7").getByRole("checkbox").getAttribute("aria-checked")) === "false", "Error → aviso y el checkbox regresa a sin marcar");

    // Borrar lo propio de hoy con confirmación
    await staff.goto(`${B}/recordatorios?vista=atrasados`);
    await ready(staff);
    await card(staff, "E2E limpieza de cadena").getByRole("button", { name: /Opciones/ }).click();
    await staff.getByRole("menuitem", { name: "Borrar" }).click();
    await staff.getByRole("alertdialog").getByRole("button", { name: "Borrar" }).click();
    await card(staff, "E2E limpieza de cadena").waitFor({ state: "detached" });
    log((await count(staff, "Atrasados")) === before.atrasados, "Mostrador borra lo suyo de hoy → contador regresa");
    await staff.screenshot({ path: shots("e2e-rec-atrasados.png"), fullPage: true });
  } catch (error) {
    console.log("✗ FALLÓ:", error.message.split("\n")[0]);
    process.exitCode = 1;
    await staff.screenshot({ path: shots("e2e-rec-error.png"), fullPage: true });
    await owner.screenshot({ path: shots("e2e-rec-error-owner.png"), fullPage: true });
  } finally {
    await browser.close();
  }
})();
