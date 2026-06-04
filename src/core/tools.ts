// Инструментите на коуча — дефиниции (JSON Schema) + изпълнение. Ползват се
// еднакво от Telegram и от уеб. Връщат кратък текст-резултат към модела, а
// UI-действията (опции/предложение за сесия) се събират в `ui` обекта, който
// клиентът рендерира като бутони/чипове/линк.

import type { ToolCall, ToolDef } from "../llm/types";
import {
  deactivateHabit,
  listReminders,
  removeReminder,
  upsertHabit,
  upsertReminder,
  updateProfileFields,
  addInsight,
  setUserTimezone,
} from "../memory";

export type CoachOption = { label: string; value: string };

export type CoachUiActions = {
  options?: { intro?: string; items: CoachOption[] };
  offer?: {
    type: "short" | "deep";
    topic?: string;
    reason?: string;
    url: string;
  };
};

function webUrl(): string {
  return (process.env.WEB_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export const COACH_TOOLS: ToolDef[] = [
  {
    name: "update_profile",
    description:
      "Запиши/обнови това, което си разбрал за човека: идентичност, вярвания, цели, визия за желаното бъдеще, проблеми, фокус. Викай го прогресивно, когато научиш ново нещо — не чакай края.",
    parameters: {
      type: "object",
      properties: {
        identityCurrent: { type: "string", description: "Как се описва сега" },
        identityTarget: { type: "string", description: "Какъв иска да стане" },
        beliefsLimiting: { type: "string", description: "Ограничаващи вярвания" },
        beliefsNew: { type: "string", description: "Нови, преформулирани вярвания" },
        story: { type: "string", description: "Личната история, която си разказва" },
        problems: { type: "string", description: "Проблеми/съпротиви" },
        goals: { type: "string", description: "Конкретни цели" },
        vision: {
          type: "string",
          description: "Жива визия за желаното бъдеще (текущо->желано състояние)",
        },
        focus: {
          type: "string",
          enum: ["habits", "goals", "beliefs", "identity"],
          description: "Върху какво се фокусира човекът в момента",
        },
      },
    },
  },
  {
    name: "upsert_habit",
    description:
      "Създай или обнови навик. kind='build' за навик, който градим; kind='limiting' за ограничаващ/негативен навик — тогава опиши тригера (момента/ситуацията, която го предизвиква).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        kind: { type: "string", enum: ["build", "limiting"] },
        trigger: { type: "string", description: "Тригер за ограничаващите навици" },
        identityLink: { type: "string", description: "С коя идентичност е свързан" },
        cadence: { type: "string", description: "напр. 'всеки ден', 'пн/ср/пт'" },
      },
      required: ["name"],
    },
  },
  {
    name: "deactivate_habit",
    description: "Деактивирай навик (по име или id).",
    parameters: {
      type: "object",
      properties: { habit: { type: "string" } },
      required: ["habit"],
    },
  },
  {
    name: "upsert_reminder",
    description:
      "Създай или обнови персонално напомняне в конкретен час. Викай го, когато се договорите кога и за какво да пишеш на човека. time е 'HH:MM' (24ч), days е '*' или напр. 'mon,wed,fri'.",
    parameters: {
      type: "object",
      properties: {
        time: { type: "string", description: "'HH:MM', напр. '06:00'" },
        days: { type: "string", description: "'*' или 'mon,tue,...'" },
        reason: { type: "string", description: "Кратка тема, напр. 'медитация'" },
        promptHint: {
          type: "string",
          description: "Какво да съдържа съобщението в този час",
        },
      },
      required: ["time", "reason"],
    },
  },
  {
    name: "remove_reminder",
    description:
      "Премахни напомняне. Подай 'time' (HH:MM) и/или 'reason' за да го намерим.",
    parameters: {
      type: "object",
      properties: {
        time: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "list_reminders",
    description: "Покажи текущите активни напомняния на човека.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "set_timezone",
    description:
      "Запиши часовата зона на човека (IANA, напр. 'Europe/Sofia'), за да са точни напомнянията.",
    parameters: {
      type: "object",
      properties: { timezone: { type: "string" } },
      required: ["timezone"],
    },
  },
  {
    name: "log_insight",
    description:
      "Запиши ключово прозрение или преформулирано вярване от разговора (1-2 изречения).",
    parameters: {
      type: "object",
      properties: { content: { type: "string" } },
      required: ["content"],
    },
  },
  {
    name: "offer_session",
    description:
      "Предложи на човека отделна сесия (кратка или дълбока) по конкретна тема, когато усетиш съпротива, отклонение от целите или нещо, което заслужава по-дълбока работа. Клиентът ще покаже линк/бутон за стартиране.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["short", "deep"] },
        topic: { type: "string", description: "Темата на сесията" },
        reason: { type: "string", description: "Защо я предлагаш (кратко)" },
      },
      required: ["type"],
    },
  },
  {
    name: "present_options",
    description:
      "Покажи 2-4 кратки опции като бутони (само при ориентация или предлагане на посока). Човек винаги може и да напише свободно. НЕ го ползвай в нормален дълбок разговор.",
    parameters: {
      type: "object",
      properties: {
        intro: { type: "string", description: "Кратък водещ текст (по избор)" },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "string" },
            },
            required: ["label"],
          },
        },
      },
      required: ["options"],
    },
  },
];

const DAY_MAP: Record<string, string> = {
  mon: "понеделник",
  tue: "вторник",
  wed: "сряда",
  thu: "четвъртък",
  fri: "петък",
  sat: "събота",
  sun: "неделя",
};

function describeDays(days: string): string {
  if (!days || days === "*") return "всеки ден";
  return days
    .split(",")
    .map((d) => DAY_MAP[d.trim()] || d.trim())
    .join(", ");
}

// Връща функция-изпълнител за подаване на runConversation.
export function makeToolExecutor(userId: number, ui: CoachUiActions) {
  return async (call: ToolCall): Promise<string> => {
    const a = call.arguments || {};
    switch (call.name) {
      case "update_profile": {
        await updateProfileFields(userId, a as any);
        return "Профилът е обновен.";
      }
      case "upsert_habit": {
        const h = await upsertHabit(userId, {
          name: String(a.name || "").trim(),
          kind: (a.kind as "build" | "limiting") || "build",
          trigger: a.trigger ? String(a.trigger) : undefined,
          identityLink: a.identityLink ? String(a.identityLink) : undefined,
          cadence: a.cadence ? String(a.cadence) : undefined,
        });
        return h
          ? `Записан навик: "${h.name}" (${h.kind === "limiting" ? "ограничаващ" : "за изграждане"}).`
          : "Не успях да запиша навика.";
      }
      case "deactivate_habit": {
        const r = await deactivateHabit(userId, String(a.habit || ""));
        return r ? `Навикът "${r.name}" е деактивиран.` : "Не намерих такъв навик.";
      }
      case "upsert_reminder": {
        const time = String(a.time || "").trim();
        if (!/^\d{1,2}:\d{2}$/.test(time)) {
          return "Невалиден час. Очаквам формат 'HH:MM'.";
        }
        const r = await upsertReminder(userId, {
          time: time.padStart(5, "0"),
          days: a.days ? String(a.days) : "*",
          reason: a.reason ? String(a.reason) : "",
          promptHint: a.promptHint ? String(a.promptHint) : "",
        });
        return `Напомняне в ${r.time} (${describeDays(r.days)})${r.reason ? ` за "${r.reason}"` : ""} е настроено.`;
      }
      case "remove_reminder": {
        const list = await listReminders(userId, false);
        const time = a.time ? String(a.time).padStart(5, "0") : undefined;
        const reason = a.reason ? String(a.reason).toLowerCase() : undefined;
        const match = list.find(
          (r) =>
            (time ? r.time === time : true) &&
            (reason ? r.reason.toLowerCase().includes(reason) : true) &&
            (time || reason)
        );
        if (!match) return "Не намерих такова напомняне.";
        await removeReminder(userId, match.id);
        return `Напомнянето в ${match.time} е премахнато.`;
      }
      case "list_reminders": {
        const list = await listReminders(userId, true);
        if (!list.length) return "Няма активни напомняния.";
        return (
          "Активни напомняния:\n" +
          list
            .map(
              (r) =>
                `- ${r.time} (${describeDays(r.days)})${r.reason ? `: ${r.reason}` : ""}`
            )
            .join("\n")
        );
      }
      case "set_timezone": {
        await setUserTimezone(userId, String(a.timezone || "Europe/Sofia"));
        return `Часовата зона е зададена на ${a.timezone}.`;
      }
      case "log_insight": {
        const content = String(a.content || "").trim();
        if (!content) return "Празно прозрение — не записах нищо.";
        await addInsight(userId, content);
        return "Прозрението е записано в паметта.";
      }
      case "offer_session": {
        const type = (a.type as "short" | "deep") || "deep";
        ui.offer = {
          type,
          topic: a.topic ? String(a.topic) : undefined,
          reason: a.reason ? String(a.reason) : undefined,
          url: `${webUrl()}/chat?deep=1`,
        };
        return "Предложението за сесия е готово за показване.";
      }
      case "present_options": {
        const items = Array.isArray(a.options)
          ? (a.options as any[])
              .map((o) => ({
                label: String(o?.label || "").trim(),
                value: String(o?.value || o?.label || "").trim(),
              }))
              .filter((o) => o.label)
              .slice(0, 4)
          : [];
        if (items.length) {
          ui.options = {
            intro: a.intro ? String(a.intro) : undefined,
            items,
          };
        }
        return "Опциите са готови за показване.";
      }
      default:
        return `Непознат инструмент: ${call.name}`;
    }
  };
}
