import { describe, expect, it } from "vitest";
import {
  addDays,
  dayToDb,
  dbToDay,
  endOfDayInTZ,
  formatDay,
  formatForDisplay,
  getRange,
  getToday,
  getTomorrow,
  isDayKey,
  startOfDayInTZ,
} from "./date";

// México está en UTC-6 todo el año (sin horario de verano desde 2022).
const mx = (local: string) => new Date(`${local}-06:00`);

describe("hoy y mañana en México", () => {
  it("a las 23:00 de México sigue siendo el mismo día (en UTC ya es mañana)", () => {
    const now = mx("2026-10-04T23:00:00");
    expect(now.toISOString()).toBe("2026-10-05T05:00:00.000Z");
    expect(getToday(now)).toBe("2026-10-04");
    expect(getTomorrow(now)).toBe("2026-10-05");
  });

  it("el bug clásico: después de las 18:00 no se adelanta el día", () => {
    expect(getToday(mx("2026-10-04T18:30:00"))).toBe("2026-10-04");
    expect(getToday(mx("2026-10-04T23:59:59"))).toBe("2026-10-04");
  });

  it("a las 00:30 de México ya es el día siguiente", () => {
    expect(getToday(mx("2026-10-05T00:30:00"))).toBe("2026-10-05");
  });

  it("mañana cruza fin de mes y de año", () => {
    expect(getTomorrow(mx("2026-10-31T22:00:00"))).toBe("2026-11-01");
    expect(getTomorrow(mx("2026-12-31T23:30:00"))).toBe("2027-01-01");
  });
});

describe("días calendario (@db.Date)", () => {
  it("ida y vuelta sin cambiar de día", () => {
    expect(dayToDb("2026-10-04").toISOString()).toBe("2026-10-04T00:00:00.000Z");
    expect(dbToDay(dayToDb("2026-10-04"))).toBe("2026-10-04");
  });

  it("addDays respeta meses, bisiestos y negativos", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09"); // semana de cambio de horario en EE. UU.
  });

  it("valida el formato y que el día exista", () => {
    expect(isDayKey("2026-10-04")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("04/10/2026")).toBe(false);
  });
});

describe("instantes del día de México", () => {
  it("el día 4 de octubre en México va de 06:00 UTC a 05:59:59.999 UTC del 5", () => {
    expect(startOfDayInTZ("2026-10-04").toISOString()).toBe("2026-10-04T06:00:00.000Z");
    expect(endOfDayInTZ("2026-10-04").toISOString()).toBe("2026-10-05T05:59:59.999Z");
  });
});

describe("rangos rápidos", () => {
  const sunday = mx("2026-10-04T21:00:00"); // domingo

  it("Hoy", () => {
    expect(getRange("today", sunday)).toEqual({ from: "2026-10-04", to: "2026-10-04" });
  });

  it("Esta semana empieza en lunes, aunque hoy sea domingo", () => {
    expect(getRange("week", sunday)).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(getRange("week", mx("2026-09-28T08:00:00"))).toEqual({ from: "2026-09-28", to: "2026-10-04" });
  });

  it("Este mes, incluyendo febrero bisiesto", () => {
    expect(getRange("month", sunday)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(getRange("month", mx("2028-02-10T12:00:00"))).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});

describe("formato para mostrar", () => {
  it("día calendario en español", () => {
    expect(formatDay("2026-10-04")).toBe("dom 4 oct 2026");
    expect(formatDay(dayToDb("2026-10-04"), "d 'de' MMMM")).toBe("4 de octubre");
  });

  it("instante en hora de México", () => {
    expect(formatForDisplay(new Date("2026-10-05T05:15:00Z"))).toBe("4 oct 2026, 23:15");
  });
});
