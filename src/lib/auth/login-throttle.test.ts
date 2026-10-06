import { describe, expect, it } from "vitest";
import { clientIp, EMAIL_RULE, IP_RULE, LoginThrottle } from "./login-throttle";

const MIN = 60_000;

function setup() {
  let now = 1_000_000;
  const throttle = new LoginThrottle(() => now);
  return { throttle, advance: (ms: number) => (now += ms) };
}

describe("límite de intentos de login", () => {
  it(`por correo: al fallo ${EMAIL_RULE.max} se bloquea 15 min, aunque cambie de IP`, () => {
    const { throttle, advance } = setup();
    for (let i = 0; i < EMAIL_RULE.max - 1; i++) throttle.fail("gera@toga.mx", `10.0.0.${i}`);
    expect(throttle.blockedFor("gera@toga.mx", "10.0.0.99")).toBeNull();
    throttle.fail("gera@toga.mx", "10.0.0.50");
    expect(throttle.blockedFor("gera@toga.mx", "10.0.0.99")).toBe(15);
    advance(14 * MIN);
    expect(throttle.blockedFor("gera@toga.mx", "10.0.0.99")).toBe(1);
    advance(MIN + 1);
    expect(throttle.blockedFor("gera@toga.mx", "10.0.0.99")).toBeNull();
  });

  it("otro correo desde otra IP no se ve afectado", () => {
    const { throttle } = setup();
    for (let i = 0; i < EMAIL_RULE.max; i++) throttle.fail("gera@toga.mx", "1.1.1.1");
    expect(throttle.blockedFor("mostrador@toga.mx", "2.2.2.2")).toBeNull();
  });

  it(`por IP: al fallo ${IP_RULE.max} con correos distintos se bloquea esa IP`, () => {
    const { throttle } = setup();
    for (let i = 0; i < IP_RULE.max; i++) throttle.fail(`persona${i}@x.mx`, "6.6.6.6");
    expect(throttle.blockedFor("otro@x.mx", "6.6.6.6")).toBe(15);
    expect(throttle.blockedFor("otro@x.mx", "7.7.7.7")).toBeNull();
  });

  it("los fallos viejos (fuera de la ventana) no cuentan", () => {
    const { throttle, advance } = setup();
    for (let i = 0; i < EMAIL_RULE.max - 1; i++) throttle.fail("gera@toga.mx", "1.1.1.1");
    advance(16 * MIN);
    throttle.fail("gera@toga.mx", "1.1.1.1");
    expect(throttle.blockedFor("gera@toga.mx", "1.1.1.1")).toBeNull();
  });

  it("entrar bien borra los fallos de ese correo", () => {
    const { throttle } = setup();
    for (let i = 0; i < EMAIL_RULE.max - 1; i++) throttle.fail("gera@toga.mx", "1.1.1.1");
    throttle.succeed("gera@toga.mx");
    throttle.fail("gera@toga.mx", "1.1.1.1");
    expect(throttle.blockedFor("gera@toga.mx", "1.1.1.1")).toBeNull();
  });
});

describe("IP del cliente detrás de Traefik", () => {
  it("toma el último valor de X-Forwarded-For (el que agrega Traefik)", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("un valor inventado al inicio no cambia la IP", () => {
    const a = clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 203.0.113.9" }));
    const b = clientIp(new Headers({ "x-forwarded-for": "8.8.8.8, 203.0.113.9" }));
    expect(a).toBe(b);
  });

  it("sin proxy → local", () => {
    expect(clientIp(new Headers())).toBe("local");
  });
});
