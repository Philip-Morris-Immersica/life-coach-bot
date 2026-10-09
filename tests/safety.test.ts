import { describe, expect, it } from "vitest";
import { assessRisk, crisisReply, SAFETY_BLOCK, withSafety } from "@/src/core/safety";

describe("assessRisk", () => {
  it("засича кризисни сигнали на български", () => {
    expect(assessRisk("Искам да умра").level).toBe("crisis");
    expect(assessRisk("понякога си мисля да се самоубия").level).toBe("crisis");
    expect(assessRisk("Не искам да живея така повече").level).toBe("crisis");
    expect(assessRisk("мисля за самонараняване").level).toBe("crisis");
  });

  it("засича кризисни сигнали на английски", () => {
    expect(assessRisk("I want to die").level).toBe("crisis");
    expect(assessRisk("thinking about suicide").level).toBe("crisis");
    expect(assessRisk("I don't want to live").level).toBe("crisis");
  });

  it("различава причините", () => {
    expect(assessRisk("искам да се самоубия").reason).toBe("suicide");
    expect(assessRisk("искам да се нараня").reason).toBe("self-harm");
    expect(assessRisk("ще го убия").reason).toBe("harm-others");
  });

  it("не задейства при обичайни съобщения", () => {
    expect(assessRisk("Днес ми е трудно да стана сутрин").level).toBe("none");
    expect(assessRisk("ще умра от скука на тази среща").level).toBe("none");
    expect(assessRisk("убих си времето във фейсбук").level).toBe("none");
    expect(assessRisk("").level).toBe("none");
  });

  it("уважава ясно отричане", () => {
    expect(assessRisk("не мисля за самоубийство, просто съм уморен").level).toBe("none");
    expect(assessRisk("не искам да умра, искам да се променя").level).toBe("none");
  });
});

describe("crisisReply", () => {
  it("насочва към 112, доверен човек и специалист", () => {
    const text = crisisReply("suicide");
    expect(text).toContain("112");
    expect(text).toMatch(/специалист/);
    expect(text).toMatch(/довери/);
  });

  it("има отделен текст при насилие към други", () => {
    expect(crisisReply("harm-others")).toContain("112");
    expect(crisisReply("harm-others")).not.toBe(crisisReply("suicide"));
  });
});

describe("withSafety", () => {
  it("слага блока най-отпред във всеки промпт", () => {
    const out = withSafety("ПРОМПТ НА КОУЧА");
    expect(out.startsWith(SAFETY_BLOCK)).toBe(true);
    expect(out.endsWith("ПРОМПТ НА КОУЧА")).toBe(true);
  });

  it("описва границите на коучинга", () => {
    expect(SAFETY_BLOCK).toMatch(/не терапевт/);
    expect(SAFETY_BLOCK).toContain("112");
  });
});
