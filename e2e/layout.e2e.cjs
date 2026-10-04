// Revisión de diseño en varios anchos (regla de CLAUDE.md «Revisión UX/UI»):
// - la página nunca tiene scroll horizontal,
// - ningún diálogo se desborda a lo ancho,
// - en celular, lo que se toca mide al menos 40 px de alto.
// Deja capturas en e2e/screenshots/layout-<ancho>-<pantalla>.png
const { chromium } = require("playwright-core");
const { CHROME, B, shots, log } = require("./config.cjs");

const WIDTHS = [360, 390, 600, 768, 1280];
const PAGES = [
  ["inicio", "/"],
  ["recordatorios", "/recordatorios"],
  ["completados", "/recordatorios?vista=completados"],
  ["pagos", "/pagos"],
  ["proveedores", "/proveedores"],
];
// Diálogos: [nombre, ruta, cómo abrirlo]
const DIALOGS = [
  ["nuevo-recordatorio", "/recordatorios", (p) => p.getByRole("button", { name: "Nuevo recordatorio" }).locator("visible=true").first().click()],
  ["detalle", "/recordatorios?vista=completados", (p) => p.getByRole("button", { name: "Ver detalle" }).first().click()],
  ["registrar-pago", "/pagos", (p) => p.getByRole("button", { name: "Registrar pago" }).locator("visible=true").first().click()],
  ["nuevo-proveedor", "/proveedores", (p) => p.getByRole("button", { name: "Nuevo proveedor" }).locator("visible=true").first().click()],
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
  for (const dialog of document.querySelectorAll('[role="dialog"], [role="alertdialog"]')) {
    if (dialog.scrollWidth > dialog.clientWidth + 1) problems.push(`diálogo con scroll horizontal (${dialog.scrollWidth} > ${dialog.clientWidth})`);
  }
  // Elementos que se salen de la pantalla por la derecha o la izquierda.
  const root = document.querySelector('[role="dialog"]') ?? document.querySelector("main");
  for (const el of root?.querySelectorAll("*") ?? []) {
    if (!visible(el) || el.closest("[data-sonner-toaster], nextjs-portal")) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
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

      // Ficha del primer proveedor (la pantalla con más contenido).
      await page.goto(`${B}/proveedores`);
      const supplierHref = await page.locator('main a[href^="/proveedores/"]').first().getAttribute("href");
      for (const [label, path] of [...PAGES, ["proveedor", supplierHref]]) {
        await page.goto(`${B}${path}`);
        await page.waitForLoadState("networkidle");
        const problems = await page.evaluate(audit, mobile);
        log(problems.length === 0, `${width}px ${label}${problems.length ? ": " + problems.join("; ") : ""}`);
        await page.screenshot({ path: shots(`layout-${width}-${label}.png`), fullPage: true });
      }
      for (const [label, path, open] of DIALOGS) {
        await page.goto(`${B}${path}`);
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
