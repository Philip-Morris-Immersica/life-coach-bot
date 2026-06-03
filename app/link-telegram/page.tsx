import { requireSession } from "@/lib/session";
import { getUserById } from "@/src/memory";
import LinkTelegramForm from "./form";

export const dynamic = "force-dynamic";

export default async function LinkTelegramPage() {
  const session = await requireSession();
  const user = await getUserById(session.userId);
  const linked = !!user?.telegramId;

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Свържи Telegram</h1>
      {linked ? (
        <div className="card">
          <p>
            Този профил вече е свързан с Telegram акаунт (ID:{" "}
            <code>{String(user!.telegramId)}</code>). Историята и навиците ти са
            общи между сайта и бота.
          </p>
        </div>
      ) : (
        <>
          <div className="card space-y-2 text-sm">
            <p>
              За да обединим разговорите с Telegram бота и сайта в обща памет:
            </p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>
                Отвори Telegram и пиши на бота командата <code>/link</code>.
              </li>
              <li>Ще получиш 8-знаков код, валиден 15 минути.</li>
              <li>Въведи го тук:</li>
            </ol>
          </div>
          <LinkTelegramForm />
        </>
      )}
    </div>
  );
}
