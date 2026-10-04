// Revisión de diseño en varios anchos (regla de CLAUDE.md «Revisión UX/UI»):
// - la página nunca tiene scroll horizontal,
// - ningún diálogo se desborda a lo ancho,
// - en celular, lo que se toca mide al menos 40 px de alto.
// Deja capturas en e2e/screenshots/layout-<ancho>-<pantalla>.png
const { chromium } = require("playwright-core");
const { CHROME, B, shots, log } = require("./config.cjs");

const WIDTHS = [360, 375, 390, 600, 768, 1280];
const PAGES = [
  ["inicio", "/"],
  ["recordatorios", "/recordatorios"],
  ["completados", "/recordatorios?vista=completados"],
  ["recordatorios-busqueda", "/recordatorios?q=a"],
  ["pagos", "/pagos"],
  ["proveedores", "/proveedores"],
  ["admin", "/admin"],
  ["admin-catalogos", "/admin/catalogos"],
  ["admin-clientes", "/admin/clientes"],
  ["admin-usuarios", "/admin/usuarios"],
  ["admin-auditoria", "/admin/auditoria"],
  ["admin-configuracion", "/admin/configuracion"],
  ["admin-papelera", "/admin/papelera"],
];
// Diálogos: [nombre, ruta, cómo abrirlo]
const DIALOGS = [
  ["nuevo-recordatorio", "/recordatorios", (p) => p.getByRole("button", { name: "Nuevo recordatorio" }).locator("visible=true").first().click()],
  ["detalle", "/recordatorios?vista=completados", (p) => p.getByRole("button", { name: "Ver detalle" }).first().click()],
  ["registrar-pago", "/pagos", (p) => p.getByRole("button", { name: "Registrar pago" }).locator("visible=true").first().click()],
  // Con un proveedor que debe: aparecen adeudos y «Liquidar» (aquí se desbordaba a 375 px).
  [
    "registrar-pago-con-adeudo",
    "/pagos",
    async (p) => {
      await p.getByRole("button", { name: "Registrar pago" }).locator("visible=true").first().click();
      const d = p.getByRole("dialog", { name: "Registrar pago" });
      await d.getByLabel("Proveedor").fill("Platería");
      await d.getByRole("button", { name: /^Platería/ }).first().click();
      await d.getByText(/Abono a ADE-/).first().waitFor();
      await d.getByLabel("Monto").fill("100");
    },
  ],
  ["nuevo-proveedor", "/proveedores", (p) => p.getByRole("button", { name: "Nuevo proveedor" }).locator("visible=true").first().click()],
  ["detalle-pago", "/pagos", async (p) => {
    await p.getByRole("button", { name: /Opciones de PAG-/ }).locator("visible=true").first().click();
    await p.getByRole("menuitem", { name: "Ver detalle" }).click();
  }],
  // Búsqueda global (lupa del encabezado), con resultados.
  ["busqueda", "/", async (p) => {
    await p.getByRole("button", { name: "Buscar" }).click();
    await p.getByRole("dialog", { name: "Buscar" }).getByRole("combobox").fill("a");
    await p.getByRole("option").first().waitFor();
  }],
  ["pago-de-pedido", "CLIENTE", (p) => p.getByRole("button", { name: "Registrar pago de este pedido" }).first().click()],
  ["nueva-categoria", "/admin/catalogos", (p) => p.getByRole("button", { name: "Nueva categoría" }).click()],
  ["nuevo-usuario", "/admin/usuarios", (p) => p.getByRole("button", { name: "Nuevo usuario" }).click()],
  ["filtros-auditoria-calendario", "/admin/auditoria", (p) => p.getByLabel("Desde").click()],
  // Solo en celular: el menú de la barra inferior.
  ["menu", "/", (p) => p.getByRole("button", { name: "Menú" }).click(), { mobileOnly: true }],
  // Mostrador en un pedido que no puede editar (de otro día o de otro usuario). Va al final:
  // deja la sesión como mostrador.
  ["cambiar-fecha", "/api/dev/login?as=mostrador@joyeria.local&next=%2Frecordatorios%3Fq%3Da", async (p) => {
    for (const menu of await p.getByRole("button", { name: /^Opciones de / }).locator("visible=true").all()) {
      await menu.click();
      const item = p.getByRole("menuitem", { name: "Cambiar fecha" });
      if (await item.count()) return item.click();
      await p.keyboard.press("Escape");
    }
    throw new Error("Ningún pedido con «Cambiar fecha» para el mostrador");
  }],
];

/** Problemas de diseño en lo que se ve ahora mismo. */
function audit(mobile) {
  const problems = [];
  const vw = window.innerWidth;
  const name = (el) =>
    `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""} «${(el.innerText || "").trim().slice(0, 30)}»`;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };

  if (document.documentElement.scrollWidth > vw + 1) {
    problems.push(`la página mide ${document.documentElement.scrollWidth}px de ancho (pantalla ${vw}px)`);
  }
  for (const dialog of document.querySelectorAll('[data-slot="dialog-content"]')) {
    if (dialog.scrollWidth > dialog.clientWidth + 1) problems.push(`diálogo con scroll horizontal (${dialog.scrollWidth} > ${dialog.clientWidth})`);
    // En iPhone el panel no debe poder arrastrarse de lado (ni al cerrarse el teclado).
    const s = getComputedStyle(dialog);
    if (s.overflowX !== "hidden" || !s.touchAction.includes("pan-y")) problems.push(`diálogo arrastrable de lado (overflow-x ${s.overflowX}, touch-action ${s.touchAction})`);
  }
  // Elementos que se salen de la pantalla (o del panel, si hay un diálogo abierto).
  const dialogs = document.querySelectorAll('[role="dialog"]');
  const dialog = dialogs[dialogs.length - 1];
  const root = dialog ?? document.querySelector("main");
  const bounds = dialog ? dialog.getBoundingClientRect() : { left: 0, right: vw };
  // Lo que está dentro de un carril que se desliza a propósito (overflow-x: auto) no cuenta.
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
      if (["auto", "scroll"].includes(getComputedStyle(p).overflowX)) return true;
    }
    return false;
  };
  for (const el of root?.querySelectorAll("*") ?? []) {
    if (!visible(el) || el.closest("[data-sonner-toaster], nextjs-portal") || inScroller(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > bounds.right + 1 || r.left < bounds.left - 1) {
      problems.push(`se sale de la pantalla: ${name(el)} (${Math.round(r.left)}→${Math.round(r.right)})`);
      break;
    }
  }
  if (mobile) {
    for (const el of root?.querySelectorAll("button, a[href], [role=checkbox], [role=radio], input, select, textarea") ?? []) {
      // Los <select> ocultos de Radix (aria-hidden) no se tocan; un checkbox se toca por su etiqueta.
      if (!visible(el) || el.closest("[data-sonner-toaster], [aria-hidden=true]")) continue;
      const r = (el.type === "checkbox" && el.closest("label")?.getBoundingClientRect()) || el.getBoundingClientRect();
      if (r.width <= 2) continue;
      if (r.height < 40) problems.push(`muy chico para el dedo (${Math.round(r.height)}px): ${name(el)}`);
    }
  }
  return [...new Set(problems)];
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  let page;
  try {
    for (const width of WIDTHS) {
      const mobile = width < 768;
      // Sin isMobile a propósito: con isMobile el navegador agranda la página para que quepa lo
      // que se desborda y el desborde no se puede medir. El ancho de la ventana es el del celular.
      page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: mobile, locale: "es-MX" });
      page.setDefaultTimeout(15000);
      await page.goto(`${B}/api/dev/login?as=dueno@joyeria.local&next=/`);
      await page.waitForLoadState("networkidle");

      // Ficha del primer proveedor (la pantalla con más contenido) y del cliente con más pedidos.
      await page.goto(`${B}/proveedores`);
      const supplierHref = await page.locator('main a[href^="/proveedores/"]').first().getAttribute("href");
      await page.goto(`${B}/admin/clientes`);
      const clientHref = await page.locator('main a[href^="/clientes/"]').first().getAttribute("href");
      const pages = [
        ...PAGES,
        ["proveedor", supplierHref],
        ["cliente", clientHref],
        // El mostrador no ve totales: Inicio y la ficha del cliente sin montos generales.
        ["inicio-mostrador", "/api/dev/login?as=mostrador@joyeria.local&next=/"],
        ["cliente-mostrador", clientHref],
      ];
      for (const [label, path] of pages) {
        await page.goto(`${B}${path}`);
        await page.waitForLoadState("networkidle");
        const problems = await page.evaluate(audit, mobile);
        log(problems.length === 0, `${width}px ${label}${problems.length ? ": " + problems.join("; ") : ""}`);
        await page.screenshot({ path: shots(`layout-${width}-${label}.png`), fullPage: true });
      }
      await page.goto(`${B}/api/dev/login?as=dueno@joyeria.local&next=/`);
      for (const [label, path, open, { mobileOnly } = {}] of DIALOGS) {
        if (mobileOnly && !mobile) continue;
        await page.goto(`${B}${path === "CLIENTE" ? clientHref : path}`);
        await page.waitForLoadState("networkidle");
        await open(page);
        await page.getByRole("dialog").last().waitFor();
        await page.waitForTimeout(300); // animación de entrada
        const problems = await page.evaluate(audit, mobile);
        log(problems.length === 0, `${width}px diálogo ${label}${problems.length ? ": " + problems.join("; ") : ""}`);
        await page.screenshot({ path: shots(`layout-${width}-${label}.png`) });
        await page.keyboard.press("Escape");
      }
      await page.close();
    }
  } catch (error) {
    console.log("✗ FALLÓ:", error.message.split("\n")[0]);
    process.exitCode = 1;
    await page?.screenshot({ path: shots("layout-error.png") });
  } finally {
    await browser.close();
  }
})();
