import { describe, expect, it } from "vitest";
import {
  describeDays,
  inQuietHours,
  isValidTimezone,
  localParts,
  nextOccurrence,
  normalizeDays,
  normalizeTime,
  toCron,
} from "@/src/notifications/time";

describe("normalizeTime", () => {
  it("приема валидни часове и допълва нулите", () => {
    expect(normalizeTime("7:05")).toBe("07:05");
    expect(normalizeTime("07:05")).toBe("07:05");
    expect(normalizeTime(" 23:59 ")).toBe("23:59");
    expect(normalizeTime("00:00")).toBe("00:00");
  });

  it("отхвърля невалидни стойности", () => {
    expect(normalizeTime("24:00")).toBeNull();
    expect(normalizeTime("12:60")).toBeNull();
    expect(normalizeTime("7:5")).toBeNull();
    expect(normalizeTime("abc")).toBeNull();
    expect(normalizeTime(730)).toBeNull();
    expect(normalizeTime(undefined)).toBeNull();
  });
});

describe("normalizeDays", () => {
  it("връща * за всеки ден", () => {
    expect(normalizeDays("*")).toBe("*");
    expect(normalizeDays("")).toBe("*");
    expect(normalizeDays(undefined)).toBe("*");
    expect(normalizeDays("mon,tue,wed,thu,fri,sat,sun")).toBe("*");
  });

  it("подрежда Пн..Нд, маха дубли и работи с масиви/главни букви", () => {
    expect(normalizeDays("FRI, mon,mon,wed")).toBe("mon,wed,fri");
    expect(normalizeDays(["sun", "sat"])).toBe("sat,sun");
  });

  it("отхвърля непознати дни", () => {
    expect(normalizeDays("mon,xyz")).toBeNull();
    expect(normalizeDays(5)).toBeNull();
  });
});

describe("describeDays", () => {
  it("описва дните на български", () => {
    expect(describeDays("*")).toBe("всеки ден");
    expect(describeDays("mon,wed")).toBe("пн, ср");
  });
});

describe("inQuietHours", () => {
  it("работи в рамките на деня", () => {
    expect(inQuietHours("13:00", "15:00", "14:00")).toBe(true);
    expect(inQuietHours("13:00", "15:00", "15:00")).toBe(false);
    expect(inQuietHours("13:00", "15:00", "12:59")).toBe(false);
  });

  it("поддържа интервал през полунощ", () => {
    expect(inQuietHours("22:00", "07:00", "23:30")).toBe(true);
    expect(inQuietHours("22:00", "07:00", "03:00")).toBe(true);
    expect(inQuietHours("22:00", "07:00", "07:00")).toBe(false);
    expect(inQuietHours("22:00", "07:00", "12:00")).toBe(false);
  });

  it("празни или еднакви граници означават изключено", () => {
    expect(inQuietHours("", "", "03:00")).toBe(false);
    expect(inQuietHours("08:00", "08:00", "08:00")).toBe(false);
  });
});

describe("часови зони", () => {
  it("валидира зони", () => {
    expect(isValidTimezone("Europe/Sofia")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });

  it("localParts следва лятно и зимно часово време в София", () => {
    const summer = localParts("Europe/Sofia", new Date("2026-07-01T04:30:00Z"));
    expect(summer).toEqual({ hhmm: "07:30", day: "wed", date: "2026-07-01" });
    const winter = localParts("Europe/Sofia", new Date("2026-01-15T05:30:00Z"));
    expect(winter).toEqual({ hhmm: "07:30", day: "thu", date: "2026-01-15" });
  });

  it("localParts сменя датата според зоната", () => {
    const now = new Date("2026-07-01T22:30:00Z");
    expect(localParts("Europe/Sofia", now).date).toBe("2026-07-02");
    expect(localParts("America/New_York", now).date).toBe("2026-07-01");
  });
});

describe("toCron", () => {
  it("генерира CRON_TZ израз", () => {
    expect(toCron("07:30", "mon,wed,fri", "Europe/Sofia")).toBe(
      "CRON_TZ=Europe/Sofia 30 7 * * 1,3,5"
    );
    expect(toCron("21:00", "*", "Europe/Sofia")).toBe("CRON_TZ=Europe/Sofia 0 21 * * *");
  });

  it("поставя неделя като 0 и подрежда числово", () => {
    expect(toCron("08:00", "sat,sun", "Europe/Sofia")).toBe("CRON_TZ=Europe/Sofia 0 8 * * 0,6");
  });

  it("хвърля при невалидни входове", () => {
    expect(() => toCron("25:00", "*", "Europe/Sofia")).toThrow();
    expect(() => toCron("08:00", "funday", "Europe/Sofia")).toThrow();
    expect(() => toCron("08:00", "*", "Nowhere/Land")).toThrow();
  });
});

describe("nextOccurrence", () => {
  // Сряда 07:30 в София.
  const now = new Date("2026-07-01T04:30:00Z");

  it("избира най-близкото днес", () => {
    const r = [
      { time: "21:00", days: "*", active: true },
      { time: "08:00", days: "*", active: true },
    ];
    const next = nextOccurrence(r, "Europe/Sofia", now);
    expect(next?.time).toBe("08:00");
    expect(next?.daysAhead).toBe(0);
  });

  it("минава на утре, ако часът е минал", () => {
    const next = nextOccurrence([{ time: "07:00", days: "*", active: true }], "Europe/Sofia", now);
    expect(next?.daysAhead).toBe(1);
  });

  it("взима предвид дните от седмицата", () => {
    const next = nextOccurrence([{ time: "09:00", days: "mon", active: true }], "Europe/Sofia", now);
    expect(next?.daysAhead).toBe(5);
  });

  it("игнорира неактивни и връща null без кандидати", () => {
    expect(nextOccurrence([{ time: "09:00", days: "*", active: false }], "Europe/Sofia", now)).toBeNull();
    expect(nextOccurrence([], "Europe/Sofia", now)).toBeNull();
  });
});
