// Регистър от избираеми модели (OpenAI + Anthropic) с ориентировъчни цени
// (USD за 1 милион токени). Цените служат за приблизителна калкулация на
// разхода по разговор/сесия — не са обвързващи и лесно се обновяват.

export type Provider = "openai" | "anthropic";

export type ModelInfo = {
  id: string;
  label: string;
  provider: Provider;
  // USD на 1 милион токени
  inputPer1M: number;
  outputPer1M: number;
};

export const MODELS: ModelInfo[] = [
  // --- OpenAI ---
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini (бърз, евтин)",
    provider: "openai",
    inputPer1M: 0.15,
    outputPer1M: 0.6,
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    provider: "openai",
    inputPer1M: 2.5,
    outputPer1M: 10,
  },
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    provider: "openai",
    inputPer1M: 2.0,
    outputPer1M: 8.0,
  },
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    provider: "openai",
    inputPer1M: 0.4,
    outputPer1M: 1.6,
  },
  // --- Anthropic (цените са ориентировъчни оценки) ---
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6 (препоръчан за сесии)",
    provider: "anthropic",
    inputPer1M: 3.0,
    outputPer1M: 15.0,
  },
  {
    id: "claude-sonnet-4-5-20250929",
    label: "Claude Sonnet 4.5",
    provider: "anthropic",
    inputPer1M: 3.0,
    outputPer1M: 15.0,
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5 (бърз)",
    provider: "anthropic",
    inputPer1M: 1.0,
    outputPer1M: 5.0,
  },
  {
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8 (най-силен)",
    provider: "anthropic",
    inputPer1M: 15.0,
    outputPer1M: 75.0,
  },
  {
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    provider: "anthropic",
    inputPer1M: 15.0,
    outputPer1M: 75.0,
  },
];

// Модели по подразбиране за двете роли.
export const DEFAULT_DEEP_MODEL = "claude-sonnet-4-6";
export const DEFAULT_FAST_MODEL = "gpt-4o-mini";

export function findModel(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}

// Кой доставчик обслужва даден модел. Ако не е в регистъра, познаваме по
// префикса (claude* -> anthropic, иначе openai), за да не чупим при ръчно
// въведен нов модел.
export function providerFor(modelId: string): Provider {
  const found = findModel(modelId);
  if (found) return found.provider;
  return modelId.startsWith("claude") ? "anthropic" : "openai";
}

// Приблизителен разход в USD за брой входни/изходни токени.
export function computeCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number
): number {
  const m = findModel(modelId);
  if (!m) return 0;
  const cost =
    (promptTokens / 1_000_000) * m.inputPer1M +
    (completionTokens / 1_000_000) * m.outputPer1M;
  // Закръгляме до 6 знака — стойностите са малки.
  return Math.round(cost * 1_000_000) / 1_000_000;
}
