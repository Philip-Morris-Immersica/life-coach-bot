"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Msg = { role: "user" | "assistant"; content: string };
type Stage = "orientation" | "onboarding" | "deep" | "short" | "chat";
type Option = { label: string; value: string };
type Offer = { type: "short" | "deep"; topic?: string; reason?: string; url: string };
type AutoStart = "start_deep" | "start_short" | "start_checkin" | "start_orientation" | null;
type LastCall = { action: string; text?: string; topic?: string };

const STAGE_TITLE: Record<Stage, string> = {
  orientation: "Добре дошъл",
  onboarding: "Опознаване",
  deep: "Дълбока сесия",
  short: "Кратка сесия",
  chat: "Разговор",
};

const STAGE_HINT: Record<Stage, string> = {
  orientation: "Избери откъде да започнем — или просто пиши.",
  onboarding: "Опознаваме се. Можем да обобщим и поставим цели, когато си готов.",
  deep: "Посветено време. Излез, когато стигнете до прозрение.",
  short: "Около 5-10 минути: една тема, една малка стъпка.",
  chat: "Ежедневен режим. Кратка или дълбока сесия — когато има нужда.",
};

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
  autoStart: AutoStart;
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
  const lastCall = useRef<LastCall | null>(null);
  const started = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy, error]);

  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    // Махаме ?short/?deep/?checkin от адреса, за да не стартира нова сесия при презареждане.
    window.history.replaceState(null, "", "/chat");
    void call(autoStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function call(action: string, text?: string, topic?: string) {
    lastCall.current = { action, text, topic };
    setBusy(true);
    setError(null);
    setOptions(null);
    setOffer(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, text, topic, sessionId }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Сървърна грешка. Опитай отново.");
        return;
      }
      lastCall.current = null;
      setMessages((prev) => [...prev, { role: "assistant", content: j.text }]);
      setStage(j.stage as Stage);
      if (j.sessionId) setSessionId(j.sessionId);
      setOptions(j.options || null);
      setOffer(j.offer || null);
      if (j.stage === "chat" || j.stage === "orientation") router.refresh();
    } catch {
      setError("Няма връзка. Провери интернета и опитай пак.");
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    const c = lastCall.current;
    if (c && !busy) void call(c.action, c.text, c.topic);
  }

  async function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    await call("message", text);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submit();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter изпраща, Shift+Enter е нов ред (на телефон Enter пак е нов ред при IME).
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  async function pickOption(o: Option) {
    if (busy) return;
    setMessages((prev) => [...prev, { role: "user", content: o.label }]);
    await call("message", o.value);
  }

  function startOffer() {
    if (busy || !offer) return;
    void call(offer.type === "short" ? "start_short" : "start_deep", undefined, offer.topic);
  }

  const title = sessionTitle ?? STAGE_TITLE[stage];

  return (
    <div className="grid grid-rows-[auto_1fr_auto] gap-3 h-[calc(100dvh-11rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-9rem)]">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <h1 className="page-title" style={{ fontSize: "1.35rem" }}>
            {title}
          </h1>
          <p className="muted text-sm">
            {readOnly ? "Преглед на минала сесия." : STAGE_HINT[stage]}
          </p>
        </div>
        {!readOnly && (
          <div className="flex gap-2 flex-wrap">
            {stage === "onboarding" && (
              <button
                className="btn btn-sm"
                disabled={busy}
                onClick={() => call("finalize_onboarding")}
              >
                Обобщи и постави цели
              </button>
            )}
            {stage === "deep" && (
              <button
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => call("end_deep")}
              >
                Приключи сесията
              </button>
            )}
            {stage === "short" && (
              <button
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => call("end_short")}
              >
                Приключи сесията
              </button>
            )}
            {stage === "chat" && (
              <>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => call("start_checkin")}
                >
                  Check-in
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => call("start_short")}
                >
                  Кратка сесия
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => call("start_deep")}
                >
                  Дълбока сесия
                </button>
              </>
            )}
          </div>
        )}
      </header>

      <div
        ref={scrollRef}
        className="card overflow-y-auto"
        style={{ scrollBehavior: "smooth" }}
        aria-live="polite"
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
                  <button key={i} className="chip" onClick={() => pickOption(o)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {offer && !busy && (
            <div className="card-soft mt-2" style={{ borderColor: "var(--accent)" }}>
              {offer.reason && <p className="text-sm mb-2">{offer.reason}</p>}
              <button className="btn btn-sm" onClick={startOffer}>
                {offer.type === "short" ? "Започни кратка сесия" : "Започни дълбока сесия"}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="notice notice-err text-sm flex items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          {lastCall.current && (
            <button className="btn btn-sm" onClick={retry} disabled={busy}>
              Опитай пак
            </button>
          )}
        </div>
      )}

      {readOnly ? (
        <p className="muted text-sm text-center">Това е минала сесия (само преглед).</p>
      ) : (
        <form onSubmit={onSubmit} className="flex gap-2 items-end">
          <textarea
            className="textarea"
            rows={1}
            style={{ maxHeight: "8rem", resize: "none" }}
            placeholder="Напиши съобщение…"
            aria-label="Съобщение към коуча"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
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
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
          isUser ? "bubble-user" : "bubble-ai"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
