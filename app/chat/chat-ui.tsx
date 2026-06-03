"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Msg = { role: "user" | "assistant"; content: string };
type Stage = "onboarding" | "deep" | "chat";

export default function ChatUI({
  initialMessages,
  initialStage,
  autoStartDeep,
}: {
  initialMessages: Msg[];
  initialStage: Stage;
  autoStartDeep: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [stage, setStage] = useState<Stage>(initialStage);
  const [offerDeep, setOfferDeep] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  useEffect(() => {
    if (autoStartDeep) doAction("start_deep");
    else if (initialMessages.length === 0 && initialStage === "onboarding") {
      doAction("start_onboarding");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function call(action: string, text?: string) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, text }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(j.error || "Сървърна грешка");
      return;
    }
    setMessages((prev) => [...prev, { role: "assistant", content: j.text }]);
    setStage(j.stage as Stage);
    setOfferDeep(!!j.offerDeep);
    if (j.stage === "chat") {
      // Профилът може да е сменил etap (от onboarding -> chat). Опресни таблото.
      router.refresh();
    }
  }

  async function doAction(action: string) {
    await call(action);
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    await call("message", text);
  }

  return (
    <div className="grid grid-rows-[auto_1fr_auto] gap-3 h-[calc(100vh-180px)]">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">
            {stage === "onboarding"
              ? "Опознавателна сесия"
              : stage === "deep"
                ? "Дълбока сесия"
                : "Разговор"}
          </h1>
          <p className="muted text-sm">
            {stage === "onboarding"
              ? "Запознаваме се. Натисни 'Обобщи и постави цели' когато сте готови."
              : stage === "deep"
                ? "Сократов диалог. Излез когато стигнете до прозрение."
                : "Ежедневен режим. Превключи в дълбока сесия при нужда."}
          </p>
        </div>
        <div className="flex gap-2">
          {stage === "onboarding" && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => doAction("finalize_onboarding")}
            >
              Обобщи и постави цели
            </button>
          )}
          {stage === "deep" && (
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => doAction("end_deep")}
            >
              Приключи дълбоката сесия
            </button>
          )}
          {stage === "chat" && (
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => doAction("start_deep")}
            >
              Дълбока сесия
            </button>
          )}
        </div>
      </header>

      <div
        ref={scrollRef}
        className="card overflow-y-auto"
        style={{ scrollBehavior: "smooth" }}
      >
        <div className="space-y-3">
          {messages.length === 0 && (
            <p className="muted text-sm">Все още няма съобщения.</p>
          )}
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role}>
              {m.content}
            </Bubble>
          ))}
          {busy && <Bubble role="assistant">пиша…</Bubble>}
          {offerDeep && stage === "chat" && !busy && (
            <div className="text-center pt-2">
              <button
                className="btn"
                onClick={() => doAction("start_deep")}
                disabled={busy}
              >
                Да, нека влезем дълбоко
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          className="input"
          placeholder="Напиши съобщение..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button type="submit" className="btn" disabled={busy || !input.trim()}>
          Прати
        </button>
      </form>
    </div>
  );
}

function Bubble({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${isUser ? "bg-green-700/30" : "border"}`}
        style={
          isUser
            ? undefined
            : { background: "var(--background)", borderColor: "var(--border)" }
        }
      >
        {children}
      </div>
    </div>
  );
}
