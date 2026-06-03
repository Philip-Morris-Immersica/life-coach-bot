import { requireSession } from "@/lib/session";
import { getUserById, recentMessages } from "@/src/memory";
import ChatUI from "./chat-ui";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ deep?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const user = await getUserById(session.userId);
  const initial = await recentMessages(session.userId, 30);
  const initialMessages = initial
    .filter((m): m is { role: "user" | "assistant"; content: string } => m.role !== "system");

  return (
    <ChatUI
      initialMessages={initialMessages}
      initialStage={
        user?.onboardingStage !== "done"
          ? "onboarding"
          : user?.mode === "deep" || params.deep === "1"
            ? "deep"
            : "chat"
      }
      autoStartDeep={params.deep === "1" && user?.mode !== "deep"}
    />
  );
}
