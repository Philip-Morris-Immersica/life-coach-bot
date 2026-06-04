"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Msg = { role: "user" | "assistant"; content: string };
type Stage = "orientation" | "onboarding" | "deep" | "chat";
type Option = { label: string; value: string };
type Offer = { type: "short" | "deep"; topic?: string; reason?: string; url: string };

export default function ChatUI({
  initialMessages,
  initialStage,
  autoStart,
  sessionId: initialSessionId = null,
  readOnly = false,
  sessionTitle,
}: {
  initialMessages: Msg[];
  initialStage: Stage;
  autoStart: "start_deep" | "start_orientation" | null;
  sessionId?: string | null;
  readOnly?: boolean;
  sessionTitle?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [stage, setStage] = useState<Stage>(initialStage);
  const [options, setOptions] = useState<{ intro?: string; items: Option[] } | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  useEffect(() => {
    if (autoStart) doAction(autoStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function call(action: string, text?: string, topic?: string) {
    setBusy(true);
    setError(null);
    setOptions(null);
    setOffer(null);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, text, topic, sessionId }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(j.error || "Сървърна грешка");
      return;
    }
    setMessages((prev) => [...prev, { role: "assistant", content: j.text }]);
    setStage(j.stage as Stage);
    if (j.sessionId) setSessionId(j.sessionId);
    setOptions(j.options || null);
    setOffer(j.offer || null);
    if (j.stage === "chat" || j.stage === "orientation") router.refresh();
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

  async function pickOption(o: Option) {
    if (busy) return;
    setMessages((prev) => [...prev, { role: "user", content: o.label }]);
    await call("message", o.value);
  }

  function startOffer() {
    if (busy || !offer) return;
    call("start_deep", undefined, offer.topic);
  }

  const headerTitle = sessionTitle
    ? sessionTitle
    : stage === "orientation"
      ? "Добре дошъл"
      : stage === "onboarding"
        ? "Опознаване"
        : stage === "deep"
          ? "Дълбока сесия"
          : "Разговор";

  return (
    <div className="grid grid-rows-[auto_1fr_auto] gap-3 h-[calc(100vh-180px)]">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">{headerTitle}</h1>
          <p className="muted text-sm">
            {readOnly
              ? "Преглед на минала сесия."
              : stage === "orientation"
                ? "Избери откъде да започнем — или просто пиши."
                : stage === "onboarding"
                  ? "Опознаваме се. Можем да обобщим и поставим цели, когато си готов."
                  : stage === "deep"
                    ? "Посветено време. Излез когато стигнете до прозрение."
                    : "Ежедневен режим. Превключи в дълбока сесия при нужда."}
          </p>
        </div>
        <div className="flex gap-2">
          {!readOnly && stage === "onboarding" && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => doAction("finalize_onboarding")}
            >
              Обобщи и постави цели
            </button>
          )}
          {!readOnly && stage === "deep" && (
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => doAction("end_deep")}
            >
              Приключи дълбоката сесия
            </button>
          )}
          {!readOnly && stage === "chat" && (
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
          {messages.length === 0 && !busy && (
            <p className="muted text-sm">Все още няма съобщения.</p>
          )}
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role}>
              {m.content}
            </Bubble>
          ))}
          {busy && <Bubble role="assistant">пиша…</Bubble>}

          {options && !busy && (
            <div className="space-y-2 pt-1">
              {options.intro && <p className="muted text-sm">{options.intro}</p>}
              <div className="flex flex-wrap gap-2">
                {options.items.map((o, i) => (
                  <button
                    key={i}
                    className="btn btn-ghost"
                    onClick={() => pickOption(o)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {offer && !busy && (
            <div className="card pt-3 mt-2" style={{ borderColor: "var(--accent)" }}>
              {offer.reason && <p className="text-sm mb-2">{offer.reason}</p>}
              <button className="btn" onClick={startOffer}>
                {offer.type === "short" ? "Започни кратка сесия" : "Започни дълбока сесия"}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {readOnly ? (
        <p className="muted text-sm text-center">Това е минала сесия (само преглед).</p>
      ) : (
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
      )}
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
