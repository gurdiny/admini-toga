import { describe, expect, it } from "vitest";
import { dayToDb } from "@/lib/date";
import { bucketHref, classifyReminder, parseBucket, placementWhere } from "./buckets";

// 4 oct 2026 a las 23:30 en México = 5 oct 05:30 UTC. Si algo usara el día de
// UTC, «hoy» sería el 5 y todo se correría un día.
const lateNight = new Date("2026-10-05T05:30:00.000Z");
// 4 oct 2026 a las 00:10 en México = 06:10 UTC del mismo día.
const earlyMorning = new Date("2026-10-04T06:10:00.000Z");

describe("classifyReminder", () => {
  it.each([
    ["2026-10-04", "hoy"],
    ["2026-10-05", "manana"],
    ["2026-10-03", "atrasados"],
    ["2026-09-01", "atrasados"],
    ["2026-10-06", "despues"],
  ] as const)("a las 23:30 de México, %s → %s", (targetDate, expected) => {
    expect(classifyReminder({ targetDate, isCompleted: false }, lateNight)).toBe(expected);
  });

  it("a las 00:10 de México ya cuenta el día nuevo", () => {
    expect(classifyReminder({ targetDate: "2026-10-04", isCompleted: false }, earlyMorning)).toBe("hoy");
    expect(classifyReminder({ targetDate: "2026-10-03", isCompleted: false }, earlyMorning)).toBe("atrasados");
  });

  it("completado gana a cualquier fecha", () => {
    expect(classifyReminder({ targetDate: "2026-09-01", isCompleted: true }, lateNight)).toBe("completados");
    expect(classifyReminder({ targetDate: "2026-10-05", isCompleted: true }, lateNight)).toBe("completados");
  });

  it("fin de mes y de año", () => {
    const dec31 = new Date("2026-12-31T20:00:00.000Z"); // 31 dic 14:00 en México
    expect(classifyReminder({ targetDate: "2027-01-01", isCompleted: false }, dec31)).toBe("manana");
  });
});

describe("placementWhere", () => {
  it("usa el día de México como medianoche UTC y excluye borrados", () => {
    expect(placementWhere("hoy", lateNight)).toEqual({
      deletedAt: null,
      isCompleted: false,
      targetDate: dayToDb("2026-10-04"),
    });
    expect(placementWhere("manana", lateNight)).toMatchObject({ targetDate: dayToDb("2026-10-05") });
    expect(placementWhere("atrasados", lateNight)).toMatchObject({ targetDate: { lt: dayToDb("2026-10-04") } });
    expect(placementWhere("despues", lateNight)).toMatchObject({ targetDate: { gt: dayToDb("2026-10-05") } });
  });

  it("completados: últimos 30 días desde la medianoche de México", () => {
    const where = placementWhere("completados", lateNight);
    expect(where).toMatchObject({ deletedAt: null, isCompleted: true });
    // 4 sep 2026 00:00 en México (UTC−6) = 06:00 UTC
    expect(where).toHaveProperty("completedAt.gte", new Date("2026-09-04T06:00:00.000Z"));
  });
});

describe("pestaña en la URL", () => {
  it("por defecto «Mañana»", () => {
    expect(parseBucket(undefined)).toBe("manana");
    expect(parseBucket("cualquiera")).toBe("manana");
    expect(parseBucket(["hoy", "atrasados"])).toBe("hoy");
    expect(parseBucket("completados")).toBe("completados");
  });

  it("la de por defecto no lleva parámetro", () => {
    expect(bucketHref("manana")).toBe("/recordatorios");
    expect(bucketHref("atrasados")).toBe("/recordatorios?vista=atrasados");
  });
});
