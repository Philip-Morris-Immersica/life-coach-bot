import type { Metadata } from "next";
import { requireSession } from "@/lib/session";
import {
  getActiveSession,
  getSessionById,
  getUserById,
  recentMessages,
  sessionMessages,
} from "@/src/memory";
import ChatUI from "./chat-ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Чат" };

type Msg = { role: "user" | "assistant"; content: string };

// Служебните маркери за старт на сесия не се показват като реплики.
const visible = (msgs: Msg[]): Msg[] =>
  msgs.filter((m) => !m.content.startsWith("[Потребителят започна"));

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ deep?: string; short?: string; checkin?: string; session?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const user = await getUserById(session.userId);
  const mode = user?.mode ?? "idle";
  const onboardingDone = user?.onboardingStage === "done";

  // 1. Преглед/продължение на конкретна сесия.
  if (params.session) {
    const s = await getSessionById(params.session);
    if (s && s.userId === session.userId) {
      const msgs = await sessionMessages(s.id);
      const active = s.status === "active";
      return (
        <ChatUI
          initialMessages={visible(msgs as Msg[])}
          initialStage={active && s.type === "deep" ? "deep" : active && s.type === "short" ? "short" : "chat"}
          autoStart={null}
          sessionId={s.id}
          readOnly={!active}
          sessionTitle={s.title || "Сесия"}
        />
      );
    }
  }

  // 2. Тече сесия (дълбока/кратка) — продължаваме нея, не започваме нова.
  if (mode === "deep" || mode === "short") {
    const active = await getActiveSession(session.userId, mode);
    const msgs = active ? await sessionMessages(active.id) : [];
    return (
      <ChatUI
        initialMessages={visible(msgs as Msg[])}
        initialStage={mode}
        autoStart={null}
        sessionId={active?.id ?? null}
      />
    );
  }

  // 3. Нова сесия или check-in по заявка (линк от таблото / известие).
  if (params.deep === "1") {
    return <ChatUI initialMessages={[]} initialStage="deep" autoStart="start_deep" />;
  }
  if (params.short === "1") {
    return <ChatUI initialMessages={[]} initialStage="short" autoStart="start_short" />;
  }

  // 4. Ежедневен чат (rolling поток).
  const initial = await recentMessages(session.userId, 30);
  const oriented = user?.onboardingStage && user.onboardingStage !== "new";
  const wantsCheckin = params.checkin === "1" && onboardingDone;
  return (
    <ChatUI
      initialMessages={visible(initial as Msg[])}
      initialStage={!onboardingDone ? "onboarding" : "chat"}
      autoStart={
        wantsCheckin
          ? "start_checkin"
          : initial.length === 0 && !oriented
            ? "start_orientation"
            : null
      }
    />
  );
}
