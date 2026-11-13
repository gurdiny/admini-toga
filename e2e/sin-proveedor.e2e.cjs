// Pagos sin proveedor: alta con día y hora de ahora, las tres listas de /pagos
// (a proveedores, sin proveedor, todos), totales, editar, permisos del
// mostrador, papelera, exportar, búsqueda global y, en celular, el ➕ que
// pregunta y el menú de «Pagos» de la barra de abajo.
const { launchBrowser, B, shots, log, sql } = require("./config.cjs");
const money = (text) => Number(text.replace(/[^\d.]/g, ""));
const stamp = Date.now().toString(36).slice(-4);
const NOTE = `E2E comida del taller ${stamp}`;
const STAFF_NOTE = `E2E paquetería mostrador ${stamp}`;
const MOBILE_NOTE = `E2E garrafón ${stamp}`;
/** Hora de México "HH:mm". */
const nowMX = () => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

(async () => {
  const browser = await launchBrowser();
  let page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, locale: "es-MX" });
  page.setDefaultTimeout(15000);
  // Dentro del resumen: «Sin proveedor» también es el nombre de una pestaña.
  const kpi = async (label) =>
    (await page.getByRole("region", { name: "Resumen" }).getByText(label, { exact: true }).first().locator("xpath=following-sibling::p[1]").innerText()).trim();
  const go = async (path) => {
    // 60 s: en desarrollo, la primera visita a una página la compila.
    await page.goto(`${B}${path}`, { timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 60000 }); // que React hidrate antes de hacer clic
  };

  try {
    // ─── Dueño, escritorio ──────────────────────────────────────────────
    await go("/api/dev/login?as=dueno@joyeria.local&next=/pagos?ver=sin-proveedor");
    log(await page.getByRole("heading", { name: "Pagos sin proveedor" }).isVisible(), "?ver=sin-proveedor abre «Pagos sin proveedor»");
    const before = money(await kpi("Pagado esta semana"));

    await page.getByRole("button", { name: "Pago sin proveedor" }).locator("visible=true").first().click();
    let dialog = page.getByRole("dialog", { name: "Pago sin proveedor" });
    const shownTime = await dialog.getByLabel("Hora").inputValue();
    log(Math.abs(minutes(shownTime) - minutes(nowMX())) <= 2, `La hora viene puesta con la de ahora (${shownTime})`);
    log(await dialog.getByRole("button", { name: /Hoy|hoy/ }).first().isVisible(), "El día viene puesto en hoy");

    // Sin nota no se guarda.
    await dialog.getByLabel("Cantidad").fill("150.50");
    await dialog.getByRole("button", { name: "Registrar pago" }).click();
    await dialog.getByText("Falta la nota.").waitFor();
    log(true, "Sin nota: «Falta la nota.»");
    await dialog.getByLabel("Nota").fill(NOTE);
    await dialog.getByRole("button", { name: "Registrar pago" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByText(/Pago PSP-\d{4} registrado/).waitFor();
    log(true, "Registrado con folio PSP-…");

    await page.reload();
    await page.waitForLoadState("networkidle");
    const row = page.getByRole("row", { name: new RegExp(NOTE) });
    log(await row.isVisible(), "Aparece en «Sin proveedor»");
    const after = money(await kpi("Pagado esta semana"));
    log(Math.abs(after - before - 150.5) < 0.001, `Total de sin proveedor +$150.50 → $${after}`);

    const db = await sql(`SELECT code, date::text AS date, time, amount::text AS amount, currency, "createdById" FROM other_payments WHERE note = $1`, [NOTE]);
    log(db.length === 1 && db[0].amount === "150.50" && db[0].currency === "MXN" && /^\d\d:\d\d$/.test(db[0].time), `En la base: ${JSON.stringify(db[0])}`);
    const code = `PSP-${String(db[0].code).padStart(4, "0")}`;

    // Las otras dos listas.
    await go("/pagos");
    log((await page.getByText(NOTE).count()) === 0, "«A proveedores» no lo muestra");
    const supplierWeek = money(await kpi("Pagado esta semana"));
    await go("/pagos?ver=todos");
    log(await page.getByRole("row", { name: new RegExp(NOTE) }).isVisible(), "«Todos» lo muestra");
    log((await page.locator("table").getByText(/PAG-\d{4}/).count()) > 0 || supplierWeek === 0, "«Todos» también trae pagos a proveedores");
    const allWeek = money(await kpi("Pagado esta semana"));
    log(Math.abs(allWeek - supplierWeek - after) < 0.001, `«Todos» = a proveedores ($${supplierWeek}) + sin proveedor ($${after}) = $${allWeek}`);
    log(money(await kpi("Sin proveedor")) === after, "«Todos» desglosa lo de sin proveedor");
    await page.screenshot({ path: shots("e2e-pagos-todos.png"), fullPage: true });

    // Pestañas: cambiar de lista conserva el periodo.
    await page.getByRole("link", { name: "Este mes" }).click();
    await page.waitForURL(/rango=mes/);
    await page.getByRole("navigation", { name: "Lista de pagos" }).getByRole("link", { name: "Sin proveedor" }).click();
    await page.waitForURL(/ver=sin-proveedor/);
    log(/rango=mes/.test(page.url()), "Cambiar de lista conserva el periodo (?ver=sin-proveedor&rango=mes)");

    // Editar: monto y hora.
    await go("/pagos?ver=sin-proveedor");
    await page.getByRole("row", { name: new RegExp(NOTE) }).getByRole("button", { name: `Opciones de ${code}` }).click();
    await page.getByRole("menuitem", { name: "Editar" }).click();
    dialog = page.getByRole("dialog", { name: `Editar ${code}` });
    await dialog.getByLabel("Cantidad").fill("175");
    await dialog.getByLabel("Hora").fill("08:15");
    await dialog.getByRole("button", { name: "Guardar cambios" }).click();
    await dialog.waitFor({ state: "hidden" });
    const edited = await sql(`SELECT amount::text AS amount, time FROM other_payments WHERE note = $1`, [NOTE]);
    log(edited[0].amount === "175.00" && edited[0].time === "08:15", "Editar cambia monto y hora");
    await page.getByRole("row", { name: new RegExp(NOTE) }).getByRole("button", { name: `Opciones de ${code}` }).click();
    await page.getByRole("menuitem", { name: "Ver detalle" }).click();
    const detail = page.getByRole("dialog", { name: `Pago ${code}` });
    log(await detail.getByText("Última edición").isVisible(), "Ver detalle: «Última edición»");
    await page.screenshot({ path: shots("e2e-sin-proveedor-detalle.png") });
    await page.keyboard.press("Escape");
    const audit = await sql(`SELECT action FROM audit_logs WHERE entity = 'OtherPayment' AND "entityId" = (SELECT id FROM other_payments WHERE note = $1) ORDER BY "createdAt"`, [NOTE]);
    log(audit.map((a) => a.action).join(",") === "CREATE,UPDATE", "Auditoría: CREATE y UPDATE");

    // Exportar (solo el dueño).
    const csv = await (await page.request.get(`${B}/api/exportar/pagos?ver=sin-proveedor&rango=mes&formato=csv`)).text();
    log(csv.includes(code) && csv.includes(NOTE) && csv.includes("08:15"), "Exportar «Sin proveedor» (CSV) trae folio, nota y hora");
    const csvAll = await (await page.request.get(`${B}/api/exportar/pagos?ver=todos&rango=mes&formato=csv`)).text();
    log(csvAll.includes(code) && csvAll.includes("Sin proveedor"), "Exportar «Todos» incluye los pagos sin proveedor");

    // Búsqueda global por la nota.
    await go("/");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByRole("dialog", { name: "Buscar" }).getByRole("combobox").fill(NOTE);
    await page.getByRole("option", { name: /Sin proveedor/ }).first().click();
    await page.waitForURL(/ver=sin-proveedor/);
    // Navegación del lado del cliente: la URL cambia antes que el contenido.
    await page.getByRole("row", { name: new RegExp(NOTE) }).waitFor();
    log(new URL(page.url()).searchParams.get("q") === code, `Búsqueda global lleva a «Sin proveedor» filtrado por ${code}`);

    // ─── Mostrador ──────────────────────────────────────────────────────
    await go("/api/dev/login?as=mostrador@joyeria.local&next=/pagos?ver=sin-proveedor");
    log((await page.getByText("Pagado esta semana").count()) === 0, "Mostrador no ve totales");
    log(await page.getByRole("row", { name: new RegExp(NOTE) }).isVisible(), "Mostrador sí ve la lista");
    await page.getByRole("row", { name: new RegExp(NOTE) }).getByRole("button", { name: `Opciones de ${code}` }).click();
    log(
      (await page.getByRole("menuitem", { name: "Editar" }).count()) === 0 && (await page.getByRole("menuitem", { name: "Borrar" }).count()) === 0,
      "Mostrador no edita ni borra lo que capturó el dueño",
    );
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Pago sin proveedor" }).locator("visible=true").first().click();
    dialog = page.getByRole("dialog", { name: "Pago sin proveedor" });
    await dialog.getByLabel("Cantidad").fill("80");
    await dialog.getByLabel("Nota").fill(STAFF_NOTE);
    await dialog.getByRole("button", { name: "Registrar pago" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("row", { name: new RegExp(STAFF_NOTE) }).getByRole("button", { name: /Opciones de PSP-/ }).click();
    await page.getByRole("menuitem", { name: "Borrar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Borrar" }).click();
    await page.getByRole("row", { name: new RegExp(STAFF_NOTE) }).waitFor({ state: "detached" });
    log(true, "Mostrador registra y borra su propio pago de hoy");

    // ─── Papelera ───────────────────────────────────────────────────────
    await go("/api/dev/login?as=dueno@joyeria.local&next=/admin/papelera?tipo=sin-proveedor");
    // La papelera pinta tarjeta (celular) y tabla (escritorio): se busca la que se ve.
    await page.locator("main").getByText(STAFF_NOTE).locator("visible=true").first().waitFor();
    log(true, "El borrado está en la papelera (filtro «Pagos sin proveedor»)");
    await page.getByRole("button", { name: /Restaurar/ }).first().click();
    await page.getByText(/restaurad/i).first().waitFor();
    const restored = await sql(`SELECT "deletedAt" FROM other_payments WHERE note = $1`, [STAFF_NOTE]);
    log(restored[0].deletedAt === null, "Restaurar lo devuelve");

    // ─── Celular ────────────────────────────────────────────────────────
    await page.close();
    page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: "es-MX" });
    page.setDefaultTimeout(15000);
    await go("/api/dev/login?as=dueno@joyeria.local&next=/recordatorios");
    await page.getByRole("button", { name: "Nuevo pago" }).click();
    const chooser = page.getByRole("dialog", { name: "Nuevo pago" });
    log(
      (await chooser.getByRole("button", { name: /^Pago a proveedor/ }).isVisible()) && (await chooser.getByRole("button", { name: /^Pago sin proveedor/ }).isVisible()),
      "Celular: el ➕ pregunta «Pago a proveedor» o «Pago sin proveedor»",
    );
    await page.screenshot({ path: shots("e2e-mas-elegir.png") });
    await chooser.getByRole("button", { name: /^Pago sin proveedor/ }).click();
    dialog = page.getByRole("dialog", { name: "Pago sin proveedor" });
    await dialog.getByLabel("Cantidad").fill("45");
    await dialog.getByLabel("Nota").fill(MOBILE_NOTE);
    await page.screenshot({ path: shots("e2e-sin-proveedor-celular.png") });
    await dialog.getByRole("button", { name: "Registrar pago" }).click();
    await dialog.waitFor({ state: "hidden" });
    log((await sql(`SELECT 1 FROM other_payments WHERE note = $1`, [MOBILE_NOTE])).length === 1, "Celular: registrado desde el ➕");

    await page.getByRole("button", { name: "Nuevo pago" }).click();
    await page.getByRole("dialog", { name: "Nuevo pago" }).getByRole("button", { name: /^Pago a proveedor/ }).click();
    log(await page.getByRole("dialog", { name: "Registrar pago" }).isVisible(), "Celular: «Pago a proveedor» abre el formulario de siempre");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Pagos", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Pagos" });
    log((await sheet.getByRole("link").count()) === 3, "Celular: «Pagos» abre el menú con las 3 listas");
    await page.screenshot({ path: shots("e2e-pagos-menu.png") });
    await sheet.getByRole("link", { name: /Todos los pagos/ }).click();
    await page.waitForURL(/ver=todos/);
    await page.waitForLoadState("networkidle");
    await page.getByText(MOBILE_NOTE).locator("visible=true").first().waitFor();
    log(true, "Celular: «Todos los pagos» muestra el pago sin proveedor");
    await page.screenshot({ path: shots("e2e-pagos-todos-celular.png"), fullPage: true });

    // Dentro de un proveedor el ➕ sigue abriendo directo el pago a ese proveedor.
    await go("/proveedores");
    await page.locator('main a[href^="/proveedores/"]').first().click();
    await page.waitForURL(/\/proveedores\/.+/);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Nuevo pago" }).click();
    log(await page.getByRole("dialog", { name: "Registrar pago" }).isVisible(), "Celular: en la ficha del proveedor el ➕ abre directo su pago");
  } catch (error) {
    console.log("✗ FALLÓ:", error.message.split("\n")[0]);
    process.exitCode = 1;
    await page.screenshot({ path: shots("e2e-error.png"), fullPage: true });
  } finally {
    await browser.close();
  }
})();
