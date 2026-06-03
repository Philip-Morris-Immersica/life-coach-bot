import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  isValidEmail,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { getUserByEmail } from "@/src/memory";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Невалиден JSON" }, { status: 400 });
  }
  const email = String(body.email || "").trim().toLowerCase();
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
