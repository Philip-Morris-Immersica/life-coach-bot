import { openai } from "../openai";
import type {
  CompleteOpts,
  CompletionResult,
  LLMProvider,
  ToolCall,
  Turn,
} from "./types";

// Мапва неутралните ходове към OpenAI chat.completions формат.
function toOpenAIMessages(system: string, messages: Turn[]) {
  const out: any[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.text });
    } else if (m.role === "assistant") {
      const msg: any = { role: "assistant", content: m.text || "" };
      if (m.toolCalls?.length) {
        msg.content = m.text || null;
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments ?? {}),
          },
        }));
      }
      out.push(msg);
    } else {
      // tool_results -> по едно tool съобщение за всеки резултат
      for (const r of m.results) {
        out.push({ role: "tool", tool_call_id: r.id, content: r.content });
      }
    }
  }
  return out;
}

export const openaiProvider: LLMProvider = {
  name: "openai",
  async complete(opts: CompleteOpts): Promise<CompletionResult> {
    const tools = opts.tools?.length
      ? opts.tools.map((t) => ({
          type: "function" as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }))
      : undefined;

    const res = await openai.chat.completions.create({
      model: opts.model,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens,
      messages: toOpenAIMessages(opts.system, opts.messages),
      tools,
    });

    const choice = res.choices[0]?.message;
    const toolCalls: ToolCall[] = (choice?.tool_calls ?? [])
      .filter((tc: any) => tc.type === "function")
      .map((tc: any) => {
        let args: Record<string, unknown> = {};
        try {
          args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          args = {};
        }
        return { id: tc.id, name: tc.function.name, arguments: args };
      });

    return {
      text: choice?.content?.trim() || "",
      toolCalls,
      usage: {
        promptTokens: res.usage?.prompt_tokens ?? 0,
        completionTokens: res.usage?.completion_tokens ?? 0,
      },
    };
  },
};
