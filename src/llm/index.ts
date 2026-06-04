// Единна входна точка за LLM. Избира доставчик по модела, и предоставя
// `runConversation` — цикъл, който изпълнява tool-calls докато моделът върне
// финален текст. Сумира употребата (токени) за калкулация на цена.

import { providerFor } from "./models";
import { openaiProvider } from "./openai";
import { anthropicProvider } from "./anthropic";
import type {
  LLMProvider,
  ToolCall,
  ToolDef,
  Turn,
  Usage,
} from "./types";

export * from "./types";
export * from "./models";

function getProvider(modelId: string): LLMProvider {
  return providerFor(modelId) === "anthropic"
    ? anthropicProvider
    : openaiProvider;
}

export type RunResult = {
  text: string;
  usage: Usage;
  model: string;
  // Изпълнените tool-calls (за телеметрия / UI действия).
  executedCalls: ToolCall[];
};

export async function runConversation(opts: {
  model: string;
  system: string;
  history: Turn[];
  tools?: ToolDef[];
  execute?: (call: ToolCall) => Promise<string>;
  temperature?: number;
  maxTokens?: number;
  maxRounds?: number;
}): Promise<RunResult> {
  const provider = getProvider(opts.model);
  const messages: Turn[] = [...opts.history];
  const totalUsage: Usage = { promptTokens: 0, completionTokens: 0 };
  const executedCalls: ToolCall[] = [];
  const maxRounds = opts.maxRounds ?? 5;

  let finalText = "";

  for (let round = 0; round < maxRounds; round++) {
    const res = await provider.complete({
      model: opts.model,
      system: opts.system,
      messages,
      tools: opts.tools,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
    });
    totalUsage.promptTokens += res.usage.promptTokens;
    totalUsage.completionTokens += res.usage.completionTokens;
    finalText = res.text;

    if (!res.toolCalls.length || !opts.execute) {
      break;
    }

    // Записваме хода на асистента (текст + извикванията) и изпълняваме всяко.
    messages.push({
      role: "assistant",
      text: res.text,
      toolCalls: res.toolCalls,
    });
    const results = [];
    for (const call of res.toolCalls) {
      executedCalls.push(call);
      let content = "";
      try {
        content = await opts.execute(call);
      } catch (err: any) {
        content = `Грешка при инструмент ${call.name}: ${err?.message || err}`;
      }
      results.push({ id: call.id, name: call.name, content });
    }
    messages.push({ role: "tool_results", results });
  }

  return { text: finalText, usage: totalUsage, model: opts.model, executedCalls };
}

// Прост single-shot helper (без инструменти) — за извличане на профил/прозрения.
export async function complete(opts: {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ text: string; usage: Usage; model: string }> {
  const provider = getProvider(opts.model);
  const res = await provider.complete({
    model: opts.model,
    system: opts.system,
    messages: [{ role: "user", text: opts.user }],
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
  });
  return { text: res.text, usage: res.usage, model: opts.model };
}

export type { ToolCall, ToolDef, Turn, Usage };
