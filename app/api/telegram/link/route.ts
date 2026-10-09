import { NextRequest, NextResponse } from "next/server";
import { apiAuth, isFailure, jsonError, limited, readJson } from "@/lib/api";
import { consumeLinkCode, linkTelegramToWebUser } from "@/src/memory";
import { db, usersTable } from "@/src/db";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await apiAuth(req);
  if (isFailure(auth)) return auth;
  // Кодът е кратък — ограничаваме опитите за налучкване.
  const rl = limited(req, "link-telegram", 6, 10 * 60_000, auth.user.id);
  if (rl) return rl;

  const body = await readJson(req);
  const code = String(body?.code || "").trim();
  if (!code) return jsonError("Кодът е задължителен.", 400);

  const codeUserId = await consumeLinkCode(code, "link");
  if (!codeUserId) return jsonError("Невалиден, използван или изтекъл код.", 400);

  // Намери telegramId от потребителя, който е създал кода (това е Telegram-only
  // потребителят, който е писал /link в бота).
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, codeUserId))
    .limit(1);
  const tgUser = rows[0];
  if (!tgUser?.telegramId) return jsonError("Кодът не е свързан с Telegram акаунт.", 400);

  await linkTelegramToWebUser(auth.user.id, tgUser.telegramId);
  return NextResponse.json({ ok: true });
}
