import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { consumeLinkCode, linkTelegramToWebUser } from "@/src/memory";
import { db, usersTable } from "@/src/db";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await requireSession();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Невалиден JSON" }, { status: 400 });
  }
  const code = String(body.code || "").trim();
  if (!code) {
    return NextResponse.json({ error: "Кодът е задължителен" }, { status: 400 });
  }

  const codeUserId = await consumeLinkCode(code, "link");
  if (!codeUserId) {
    return NextResponse.json(
      { error: "Невалиден, използван или изтекъл код" },
      { status: 400 }
    );
  }

  // Намери telegramId от потребителя, който е създал кода (това е Telegram-only
  // потребителят, който е писал /link в бота).
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, codeUserId))
    .limit(1);
  const tgUser = rows[0];
  if (!tgUser?.telegramId) {
    return NextResponse.json(
      { error: "Кодът не е свързан с Telegram акаунт" },
      { status: 400 }
    );
  }

  await linkTelegramToWebUser(session.userId, tgUser.telegramId);
  return NextResponse.json({ ok: true });
}
