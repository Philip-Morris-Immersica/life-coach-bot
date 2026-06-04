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

type Msg = { role: "user" | "assistant"; content: string };

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ deep?: string; session?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const user = await getUserById(session.userId);

  // 1. Преглед/продължение на конкретна сесия.
  if (params.session) {
    const s = await getSessionById(params.session);
    if (s && s.userId === session.userId) {
      const msgs = await sessionMessages(s.id);
      return (
        <ChatUI
          initialMessages={msgs as Msg[]}
          initialStage={s.status === "active" && s.type === "deep" ? "deep" : "chat"}
          autoStart={null}
          sessionId={s.id}
          readOnly={s.status !== "active"}
          sessionTitle={s.title || "Сесия"}
        />
      );
    }
  }

  // 2. Нова дълбока сесия.
  if (params.deep === "1" && user?.mode !== "deep") {
    return (
      <ChatUI
        initialMessages={[]}
        initialStage="deep"
        autoStart="start_deep"
      />
    );
  }

  // 3. Активна дълбока сесия (resume).
  if (user?.mode === "deep") {
    const active = await getActiveSession(session.userId, "deep");
    const msgs = active ? await sessionMessages(active.id) : [];
    return (
      <ChatUI
        initialMessages={msgs as Msg[]}
        initialStage="deep"
        autoStart={null}
        sessionId={active?.id ?? null}
      />
    );
  }

  // 4. Ежедневен чат (rolling поток).
  const initial = await recentMessages(session.userId, 30);
  const oriented = user?.onboardingStage && user.onboardingStage !== "new";
  return (
    <ChatUI
      initialMessages={initial as Msg[]}
      initialStage={user?.onboardingStage !== "done" ? "onboarding" : "chat"}
      autoStart={initial.length === 0 && !oriented ? "start_orientation" : null}
    />
  );
}
