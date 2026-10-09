import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  isValidEmail,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { limited } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { getUserByEmail } from "@/src/memory";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Защита от налучкване на пароли: по IP, и допълнително по имейл.
  const rl = limited(req, "login", 15, 10 * 60_000);
  if (rl) return rl;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Невалиден JSON" }, { status: 400 });
  }
  const email = String(body.email || "").trim().toLowerCase();
  const rlEmail = rateLimit(`login-email:${email}`, 8, 10 * 60_000);
  if (!rlEmail.ok) {
    return NextResponse.json(
      { error: "Твърде много опити. Опитай отново след малко." },
      { status: 429 }
    );
  }
  const password = String(body.password || "");
  if (!isValidEmail(email) || !password) {
    return NextResponse.json({ error: "Невалидни данни" }, { status: 400 });
  }

  const user = await getUserByEmail(email);
  if (!user || !user.passwordHash) {
    return NextResponse.json(
      { error: "Грешен имейл или парола" },
      { status: 401 }
    );
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { error: "Грешен имейл или парола" },
      { status: 401 }
    );
  }

  const token = await createSession({
    userId: user.id,
    email,
    isAdmin: user.isAdmin,
    name: user.name ?? undefined,
  });
  await setSessionCookie(token);
  return NextResponse.json({ ok: true });
}
