import "dotenv/config";
import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Липсва OPENAI_API_KEY в .env");
}

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const MODEL_FAST = process.env.OPENAI_MODEL_FAST || "gpt-4o-mini";
export const MODEL_DEEP = process.env.OPENAI_MODEL_DEEP || "gpt-4o";

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

export async function chat(
  messages: ChatMsg[],
  opts: { model?: string; temperature?: number } = {}
): Promise<string> {
  const res = await openai.chat.completions.create({
    model: opts.model || MODEL_FAST,
    temperature: opts.temperature ?? 0.7,
    messages,
  });
  return res.choices[0]?.message?.content?.trim() || "";
}
