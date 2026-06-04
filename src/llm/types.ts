// Неутрален формат за разговор + инструменти, който и двата доставчика
// (OpenAI, Anthropic) умеят да мапнат. Така коучинг ядрото не знае кой модел
// го обслужва.

export type ToolDef = {
  name: string;
  description: string;
  // JSON Schema на параметрите.
  parameters: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ToolResult = {
  id: string;
  name: string;
  content: string;
};

// Един "ход" в разговора (без system — той се подава отделно).
export type Turn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls?: ToolCall[] }
  | { role: "tool_results"; results: ToolResult[] };

export type Usage = { promptTokens: number; completionTokens: number };

export type CompletionResult = {
  text: string;
  toolCalls: ToolCall[];
  usage: Usage;
};

export type CompleteOpts = {
  model: string;
  system: string;
  messages: Turn[];
  tools?: ToolDef[];
  temperature?: number;
  maxTokens?: number;
};

export interface LLMProvider {
  name: "openai" | "anthropic";
  complete(opts: CompleteOpts): Promise<CompletionResult>;
}
