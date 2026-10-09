// Съдържание на известията. Текстът е ШАБЛОН (без LLM при изпращане), за да
// няма разход и закъснение в часа на напомнянето.

export type ReminderTarget = "chat" | "checkin" | "reminders";

export const REMINDER_TARGETS: { value: ReminderTarget; label: string }[] = [
  { value: "chat", label: "Чат с коуча" },
  { value: "checkin", label: "Дневен check-in" },
  { value: "reminders", label: "Настройки на напомнянията" },
];

export type PushPayload = {
  title: string;
  body: string;
  // Винаги вътрешен път (започва с "/").
  url: string;
  tag: string;
  reminderId?: string;
};

export function isReminderTarget(v: unknown): v is ReminderTarget {
  return v === "chat" || v === "checkin" || v === "reminders";
}

export function targetUrl(target: string): string {
  switch (target) {
    case "checkin":
      return "/chat?checkin=1";
    case "reminders":
      return "/settings#reminders";
    default:
      return "/chat";
  }
}

// Само вътрешни пътища — не позволяваме отваряне на външни адреси.
export function safeInternalUrl(url: string): string {
  return typeof url === "string" && /^\/(?!\/)/.test(url) ? url : "/";
}

export function defaultBody(reason: string, time: string): string {
  const hour = Number(time.split(":")[0]);
  const topic = reason.trim();
  if (topic) {
    if (hour < 12) return `Добро утро! Време е за: ${topic}. Отвори коуча, ако искаш да го прегледате заедно.`;
    if (hour >= 17) return `Вечерен момент за: ${topic}. Отдели минута за кратък преглед.`;
    return `Напомняне: ${topic}. Отдели минута за себе си.`;
  }
  if (hour < 12) return "Добро утро! Отдели минута за фокуса си за днес.";
  if (hour >= 17) return "Как мина денят? Отдели минута за кратък преглед.";
  return "Малко напомняне от коуча — как върви денят?";
}

export function buildReminderPayload(
  reminder: {
    id: string;
    time: string;
    reason: string;
    message: string;
    target: string;
  },
  opts: { privacyMode: boolean }
): PushPayload {
  const url = safeInternalUrl(targetUrl(reminder.target));
  if (opts.privacyMode) {
    return {
      title: "Life Coach",
      body: "Имаш напомняне от коуча си.",
      url,
      tag: `reminder-${reminder.id}`,
      reminderId: reminder.id,
    };
  }
  const body = reminder.message.trim() || defaultBody(reminder.reason, reminder.time);
  return {
    title: reminder.reason.trim() ? reminder.reason.trim().slice(0, 60) : "Life Coach",
    body: body.slice(0, 240),
    url,
    tag: `reminder-${reminder.id}`,
    reminderId: reminder.id,
  };
}

export function testPayload(): PushPayload {
  return {
    title: "Life Coach",
    body: "Известията работят. Натисни, за да отвориш коуча.",
    url: "/chat",
    tag: "test-notification",
  };
}
