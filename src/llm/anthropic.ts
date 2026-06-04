import Anthropic from "@anthropic-ai/sdk";
import type {
  CompleteOpts,
  CompletionResult,
  LLMProvider,
  ToolCall,
  Turn,
} from "./types";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Липсва ANTHROPIC_API_KEY в .env");
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// Мапва неутралните ходове към Anthropic Messages формат (system е отделен).
function toAnthropicMessages(messages: Turn[]): any[] {
  const out: any[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: [{ type: "text", text: m.text }] });
    } else if (m.role === "assistant") {
      const blocks: any[] = [];
      if (m.text) blocks.push({ type: "text", text: m.text });
      for (const tc of m.toolCalls ?? []) {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.arguments ?? {},
        });
      }
      out.push({ role: "assistant", content: blocks });
    } else {
      out.push({
        role: "user",
        content: m.results.map((r) => ({
          type: "tool_result",
          tool_use_id: r.id,
          content: r.content,
        })),
      });
    }
  }
  return out;
}

export const anthropicProvider: LLMProvider = {
  name: "anthropic",
  async complete(opts: CompleteOpts): Promise<CompletionResult> {
    const tools = opts.tools?.length
      ? opts.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters as any,
        }))
      : undefined;

    const res = await getClient().messages.create({
      model: opts.model,
      // Anthropic изисква max_tokens.
      max_tokens: opts.maxTokens ?? 1500,
      temperature: opts.temperature ?? 0.7,
      system: opts.system,
      messages: toAnthropicMessages(opts.messages),
      tools,
    });

    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const block of res.content) {
      if (block.type === "text") {
        text += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: (block.input as Record<string, unknown>) ?? {},
        });
      }
    }

    return {
      text: text.trim(),
      toolCalls,
      usage: {
        promptTokens: res.usage?.input_tokens ?? 0,
        completionTokens: res.usage?.output_tokens ?? 0,
      },
    };
  },
};
