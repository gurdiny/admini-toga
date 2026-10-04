// Panel de administración en celular (390 px): permisos, catálogos, clientes
// (fusionar), usuarios (alta, login real, último dueño, desactivar),
// auditoría, configuración (módulos) y papelera (restaurar).
const { chromium } = require("playwright-core");
const { CHROME, B, shots, log } = require("./config.cjs");

const MOBILE = { viewport: { width: 390, height: 844 }, hasTouch: true, locale: "es-MX" };
const E2E_EMAIL = "empleado.e2e@joyeria.local";

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await (await browser.newContext(MOBILE)).newPage();
  page.setDefaultTimeout(15000);
  const go = async (path) => {
    await page.goto(`${B}${path}`);
    await page.waitForLoadState("networkidle"); // que React hidrate antes de hacer clic
  };
  const toast = (text) => page.locator("[data-sonner-toast]").filter({ hasText: text }).first();

  try {
    // ── Permisos: el mostrador no entra ──
    await go(`/api/dev/login?as=mostrador@joyeria.local&next=${encodeURIComponent("/admin/usuarios")}`);
    log(new URL(page.url()).pathname === "/", "Mostrador en /admin/usuarios → lo regresa al inicio");
    await page.getByRole("button", { name: "Menú" }).click();
    log((await page.getByRole("dialog").getByRole("link", { name: "Administración" }).count()) === 0, "Mostrador: sin «Administración» en el Menú");
    await page.keyboard.press("Escape");

    await go(`/api/dev/login?as=dueno@joyeria.local&next=/admin`);
    log((await page.getByRole("link", { name: /Catálogos/ }).count()) > 0, "Dueño: inicio del panel con sus secciones");
    await page.screenshot({ path: shots("e2e-admin-inicio.png"), fullPage: true });

    // ── Catálogos ──
    await go("/admin/catalogos");
    await page.getByRole("button", { name: "Nueva categoría" }).click();
    let dialog = page.getByRole("dialog", { name: /Nueva categoría/ });
    await dialog.getByLabel("Nombre").fill("Plata E2E");
    await dialog.getByRole("radio", { name: "#2f7f8f" }).click();
    await dialog.getByRole("button", { name: "Crear categoría" }).click();
    await dialog.waitFor({ state: "hidden" });
    const list = page.getByRole("list", { name: "Categorías" });
    log(await list.getByText("Plata E2E").isVisible(), "Categoría nueva «Plata E2E» en la lista (al final)");

    await page.getByRole("button", { name: "Nueva categoría" }).click();
    dialog = page.getByRole("dialog", { name: /Nueva categoría/ });
    await dialog.getByLabel("Nombre").fill("  plata   e2e ");
    await dialog.getByRole("button", { name: "Crear categoría" }).click();
    await dialog.getByText("Ya existe la categoría de pago «Plata E2E».").waitFor();
    log(true, "Nombre repetido (mayúsculas/espacios distintos) → mensaje claro");
    await page.keyboard.press("Escape");

    const names = async () => (await list.locator("li .font-bold").allInnerTexts()).map((t) => t.trim());
    await go("/admin/catalogos");
    const before = await names();
    await list.getByRole("button", { name: "Opciones de Plata E2E" }).click();
    await page.getByRole("menuitem", { name: "Subir" }).click();
    await page.waitForFunction(
      (index) => [...document.querySelectorAll('[aria-label="Categorías"] li .font-bold')].findIndex((el) => el.textContent.includes("Plata E2E")) === index,
      before.indexOf("Plata E2E") - 1,
    );
    const after = await names();
    log(after.indexOf("Plata E2E") === before.indexOf("Plata E2E") - 1, `«Subir» la mueve una posición (${before.indexOf("Plata E2E")} → ${after.indexOf("Plata E2E")})`);

    // Un pago con esa categoría, luego se desactiva
    await go("/pagos");
    await page.getByRole("button", { name: "Registrar pago" }).locator("visible=true").first().click();
    dialog = page.getByRole("dialog", { name: "Registrar pago" });
    await dialog.getByLabel("Proveedor").fill("Taller de Engaste");
    await dialog.getByRole("button", { name: /^Taller de Engaste/ }).first().click();
    await dialog.getByText("Pago de contado", { exact: true }).click();
    await dialog.getByLabel("Monto").fill("10");
    await dialog.getByLabel("Concepto").fill("E2E con categoría nueva");
    await dialog.getByRole("combobox", { name: "Categoría" }).click();
    await page.getByRole("option", { name: "Plata E2E" }).click();
    await dialog.getByRole("button", { name: "Registrar pago" }).click();
    await dialog.waitFor({ state: "hidden" });

    await go("/admin/catalogos");
    await list.getByRole("button", { name: "Opciones de Plata E2E" }).click();
    await page.getByRole("menuitem", { name: "Desactivar" }).click();
    await toast("«Plata E2E» desactivada").waitFor();
    log(await toast("El registro que la usa la conserva").isVisible(), "Desactivar avisa que el pago que la usa la conserva");
    await list.locator("li", { hasText: "Plata E2E" }).getByText("Desactivada").waitFor();
    log(true, "Queda marcada «Desactivada»");

    await go("/pagos");
    log(await page.locator("li", { hasText: "E2E con categoría nueva" }).getByText("Plata E2E").isVisible(), "El pago histórico sigue mostrando «Plata E2E»");
    await page.getByRole("button", { name: "Registrar pago" }).locator("visible=true").first().click();
    dialog = page.getByRole("dialog", { name: "Registrar pago" });
    await dialog.getByLabel("Proveedor").fill("Taller de Engaste");
    await dialog.getByRole("button", { name: /^Taller de Engaste/ }).first().click();
    await dialog.getByRole("combobox", { name: "Categoría" }).click();
    log((await page.getByRole("option", { name: "Plata E2E" }).count()) === 0, "…pero ya no aparece al capturar un pago nuevo");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    // ── Papelera: borrar y restaurar ese pago ──
    await go("/pagos");
    await page.locator("li", { hasText: "E2E con categoría nueva" }).getByRole("button", { name: /Opciones de PAG-/ }).click();
    await page.getByRole("menuitem", { name: "Borrar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Borrar" }).click();
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    await go("/admin/papelera?tipo=pagos");
    const trashed = page.getByRole("list", { name: "Registros borrados" }).locator("li", { hasText: "E2E con categoría nueva" });
    log(await trashed.getByText(/Borrado .* por Gera Urias/).isVisible(), "Papelera: el pago borrado, con quién y cuándo");
    await page.screenshot({ path: shots("e2e-admin-papelera.png"), fullPage: true });
    await trashed.getByRole("button", { name: /Restaurar/ }).click();
    await trashed.waitFor({ state: "detached" });
    await go("/pagos");
    log(await page.locator("li", { hasText: "E2E con categoría nueva" }).first().isVisible(), "Restaurar → vuelve a Pagos");

    // ── Clientes: fusionar duplicados ──
    for (const note of ["E2E pedido uno", "E2E pedido dos"]) {
      await go("/recordatorios");
      await page.getByRole("button", { name: "Nuevo recordatorio" }).locator("visible=true").first().click();
      dialog = page.getByRole("dialog", { name: "Nuevo recordatorio" });
      await dialog.getByLabel("Cliente").fill("Duplicado E2E");
      await dialog.getByRole("button", { name: "Cliente nuevo «Duplicado E2E»" }).click();
      await dialog.getByLabel("¿Qué hay que hacer?").fill(note);
      await dialog.getByRole("button", { name: "Guardar recordatorio" }).click();
      await dialog.waitFor({ state: "hidden" });
    }
    await go("/admin/clientes?q=Duplicado+E2E");
    const clients = page.getByRole("list", { name: "Clientes" }).locator("li");
    log((await clients.count()) === 2, "Clientes: dos «Duplicado E2E» capturados de más");
    await clients.first().getByRole("link", { name: "Duplicado E2E", exact: true }).click();
    await page.getByRole("button", { name: "Fusionar duplicado" }).waitFor();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Fusionar duplicado" }).click();
    dialog = page.getByRole("dialog", { name: "Fusionar con un duplicado" });
    await dialog.getByLabel("Cliente duplicado").fill("Duplicado E2E");
    await dialog.getByRole("button", { name: /^Duplicado E2E/ }).first().click();
    await page.screenshot({ path: shots("e2e-admin-fusionar.png") });
    await dialog.getByRole("button", { name: "Fusionar", exact: true }).click();
    await toast("pasaron a Duplicado E2E").waitFor();
    await page.getByText("E2E pedido uno").waitFor();
    await page.getByText("E2E pedido dos").waitFor();
    log(true, "Fusionar: el cliente que queda tiene los dos pedidos");
    await go("/admin/clientes?q=Duplicado+E2E");
    log((await clients.count()) === 1, "El duplicado ya no aparece en la búsqueda");

    // ── Usuarios ──
    await go("/admin/usuarios");
    await page.getByRole("button", { name: "Nuevo usuario" }).click();
    dialog = page.getByRole("dialog", { name: "Nuevo usuario" });
    await dialog.getByLabel("Nombre").fill("Empleado E2E");
    await dialog.getByLabel("Correo").fill(E2E_EMAIL);
    await dialog.getByLabel("Contraseña").fill("prueba-1234-e2e");
    await dialog.getByRole("button", { name: "Crear usuario" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("list", { name: "Usuarios" }).getByText(E2E_EMAIL).waitFor();
    log(true, "Usuario nuevo en la lista");

    // Login real con el usuario nuevo (otra sesión)
    const other = await (await browser.newContext(MOBILE)).newPage();
    other.setDefaultTimeout(15000);
    const login = async (password) => {
      await other.context().clearCookies(); // como quien abre la app de cero
      await other.goto(`${B}/login?salir=1`);
      await other.waitForLoadState("networkidle");
      await other.getByLabel("Correo").fill(E2E_EMAIL);
      await other.getByLabel("Contraseña").fill(password);
      await other.getByRole("button", { name: "Entrar" }).click();
      // O entra (llega al inicio) o el formulario muestra el error.
      // (No usar getByRole("alert"): Next.js tiene un anunciador de rutas oculto con ese rol.)
      await Promise.race([
        other.waitForURL((url) => new URL(url).pathname === "/"),
        other.getByText(/incorrectos|desactivado|Demasiados intentos/).waitFor(),
      ]);
      await other.waitForLoadState("networkidle");
    };
    await login("prueba-1234-e2e");
    log(await other.getByText("Hola, Empleado E2E").first().isVisible(), "El usuario nuevo entra con el login real de Better Auth");

    // Último dueño: no se puede bajar de rol a uno mismo
    await page.getByRole("button", { name: "Opciones de Gera Urias" }).click();
    await page.getByRole("menuitem", { name: "Editar nombre y rol" }).click();
    dialog = page.getByRole("dialog", { name: "Editar usuario" });
    await dialog.getByRole("radio", { name: /Mostrador/ }).click();
    await dialog.getByRole("button", { name: "Guardar cambios" }).click();
    await dialog.getByText("Debe quedar al menos un dueño activo").waitFor();
    log(true, "No deja al negocio sin dueño activo");
    await page.keyboard.press("Escape");

    // Cambiar contraseña: la vieja ya no sirve
    await page.getByRole("button", { name: "Opciones de Empleado E2E" }).click();
    await page.getByRole("menuitem", { name: "Cambiar contraseña" }).click();
    dialog = page.getByRole("dialog", { name: "Cambiar contraseña" });
    await dialog.getByLabel("Contraseña").fill("nueva-5678-e2e");
    await dialog.getByRole("button", { name: "Cambiar contraseña" }).click();
    await dialog.waitFor({ state: "hidden" });
    await login("prueba-1234-e2e");
    log(await other.getByText("Correo o contraseña incorrectos.").isVisible(), "Contraseña cambiada: la anterior ya no entra");
    await login("nueva-5678-e2e");
    log(await other.getByText("Hola, Empleado E2E").first().isVisible(), "…y la nueva sí");

    // Desactivar: lo saca y ya no puede entrar
    await page.getByRole("button", { name: "Opciones de Empleado E2E" }).click();
    await page.getByRole("menuitem", { name: "Desactivar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Desactivar" }).click();
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    await other.goto(`${B}/`);
    await other.waitForLoadState("networkidle");
    // En desarrollo, DEV_AUTO_LOGIN entra solo como dueño al perder la sesión; lo que importa es que ya no es el empleado.
    log((await other.getByText("Hola, Empleado E2E").count()) === 0, `Desactivado: su sesión abierta ya no sirve (quedó en ${new URL(other.url()).pathname})`);
    await login("nueva-5678-e2e");
    log(await other.getByText("Tu usuario está desactivado").isVisible(), "…y al entrar ve que está desactivado");
    await page.screenshot({ path: shots("e2e-admin-usuarios.png"), fullPage: true });

    // ── Auditoría ──
    await go("/admin/auditoria?entidad=Category");
    const audit = page.getByRole("list", { name: "Movimientos" });
    const activeLine = (await audit.locator("li li", { hasText: "Activo:" }).first().innerText()).replace(/\s+/g, " ");
    log(activeLine === "Activo: Sí → No", `Auditoría legible al desactivar la categoría: «${activeLine}»`);
    await go("/admin/auditoria?entidad=User");
    log(await audit.getByText("Contraseña:").first().isVisible() && (await page.getByText("$2").count()) === 0 && !(await page.content()).includes("scrypt"), "Auditoría de usuarios: dice que cambió la contraseña, nunca el hash");
    await page.screenshot({ path: shots("e2e-admin-auditoria.png"), fullPage: true });

    // ── Configuración: apagar Recordatorios ──
    await go("/admin/configuracion");
    const reminders = page.getByRole("checkbox", { name: /Recordatorios/ });
    await reminders.uncheck();
    await page.getByRole("button", { name: "Guardar configuración" }).click();
    await toast("Configuración guardada").waitFor();
    await go("/");
    const bottom = page.getByRole("navigation", { name: "Principal" }).last();
    log((await bottom.getByRole("link", { name: /Recordatorios/ }).count()) === 0, "Módulo apagado: sin «Recordatorios» en la barra");
    await go("/recordatorios");
    log(new URL(page.url()).pathname === "/", "…y /recordatorios manda al inicio");
    await go("/admin/configuracion");
    await page.getByRole("checkbox", { name: /Recordatorios/ }).check();
    await page.getByRole("button", { name: "Guardar configuración" }).click();
    await toast("Configuración guardada").waitFor();
    await go("/");
    log((await page.getByRole("navigation", { name: "Principal" }).last().getByRole("link", { name: /Recordatorios/ }).count()) === 1, "Encendido otra vez: vuelve a la barra");
    await go("/admin/auditoria?entidad=AppSetting");
    log(await audit.getByText("Módulos visibles").first().isVisible(), "Auditoría: el cambio de módulos queda registrado");
  } catch (error) {
    console.log("✗ FALLÓ:", error.message.split("\n")[0]);
    process.exitCode = 1;
    await page.screenshot({ path: shots("e2e-admin-error.png"), fullPage: true });
  } finally {
    await browser.close();
  }
})();
