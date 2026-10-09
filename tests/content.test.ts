import { describe, expect, it } from "vitest";
import {
  buildReminderPayload,
  defaultBody,
  safeInternalUrl,
  targetUrl,
} from "@/src/notifications/content";
import { parseReminderInput } from "@/src/notifications/validation";

const reminder = {
  id: "r1",
  time: "07:30",
  reason: "Сутрешна медитация",
  message: "",
  target: "chat",
};

describe("safeInternalUrl", () => {
  it("пропуска само вътрешни пътища", () => {
    expect(safeInternalUrl("/chat?checkin=1")).toBe("/chat?checkin=1");
    expect(safeInternalUrl("/settings#reminders")).toBe("/settings#reminders");
  });

  it("отхвърля външни и протоколно-относителни адреси", () => {
    expect(safeInternalUrl("https://evil.example")).toBe("/");
    expect(safeInternalUrl("//evil.example")).toBe("/");
    expect(safeInternalUrl("javascript:alert(1)")).toBe("/");
    expect(safeInternalUrl("")).toBe("/");
  });
});

describe("targetUrl", () => {
  it("мапва целите към страници", () => {
    expect(targetUrl("chat")).toBe("/chat");
    expect(targetUrl("checkin")).toBe("/chat?checkin=1");
    expect(targetUrl("reminders")).toBe("/settings#reminders");
    expect(targetUrl("нещо-друго")).toBe("/chat");
  });
});

describe("buildReminderPayload", () => {
  it("ползва заглавието и шаблонен текст", () => {
    const p = buildReminderPayload(reminder, { privacyMode: false });
    expect(p.title).toBe("Сутрешна медитация");
    expect(p.body).toContain("Сутрешна медитация");
    expect(p.url).toBe("/chat");
    expect(p.tag).toBe("reminder-r1");
  });

  it("ползва собствения текст, когато има такъв", () => {
    const p = buildReminderPayload({ ...reminder, message: "Дишай дълбоко." }, { privacyMode: false });
    expect(p.body).toBe("Дишай дълбоко.");
  });

  it("в режим Поверителност не разкрива съдържанието", () => {
    const p = buildReminderPayload(
      { ...reminder, message: "тайна тема", target: "checkin" },
      { privacyMode: true }
    );
    expect(p.title).toBe("Life Coach");
    expect(p.body).not.toContain("медитация");
    expect(p.body).not.toContain("тайна");
    expect(p.url).toBe("/chat?checkin=1");
  });

  it("ограничава дължината на текста", () => {
    const p = buildReminderPayload({ ...reminder, message: "а".repeat(1000) }, { privacyMode: false });
    expect(p.body.length).toBeLessThanOrEqual(240);
  });

  it("defaultBody различава сутрин и вечер", () => {
    expect(defaultBody("", "07:00")).toMatch(/утро/i);
    expect(defaultBody("", "21:00")).toMatch(/денят/i);
  });
});

describe("parseReminderInput", () => {
  it("валидира създаване", () => {
    const ok = parseReminderInput(
      { time: "7:30", days: "mon,wed", reason: " Медитация ", target: "checkin" },
      false
    );
    expect(ok).toEqual({
      ok: true,
      value: { time: "07:30", days: "mon,wed", reason: "Медитация", target: "checkin" },
    });
  });

  it("изисква валиден час при създаване", () => {
    expect(parseReminderInput({ days: "*" }, false).ok).toBe(false);
    expect(parseReminderInput({ time: "99:99" }, false).ok).toBe(false);
  });

  it("позволява частична промяна без час", () => {
    expect(parseReminderInput({ active: false }, true)).toEqual({
      ok: true,
      value: { active: false },
    });
  });

  it("отхвърля невалидни полета", () => {
    expect(parseReminderInput({ time: "08:00", days: "xyz" }, false).ok).toBe(false);
    expect(parseReminderInput({ time: "08:00", target: "hack" }, false).ok).toBe(false);
    expect(parseReminderInput({ active: "yes" }, true).ok).toBe(false);
    expect(parseReminderInput(null, false).ok).toBe(false);
  });

  it("реже твърде дълги текстове", () => {
    const r = parseReminderInput({ time: "08:00", message: "x".repeat(900) }, false);
    expect(r.ok && r.value.message?.length).toBe(240);
  });
});
