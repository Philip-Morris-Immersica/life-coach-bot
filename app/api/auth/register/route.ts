import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  hashPassword,
  isAdminEmail,
  isValidEmail,
  setSessionCookie,
} from "@/lib/auth";
import { createWebUser, getUserByEmail } from "@/src/memory";
import { db, usersTable } from "@/src/db";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Невалиден JSON" }, { status: 400 });
  }
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!name) return NextResponse.json({ error: "Името е задължително" }, { status: 400 });
  if (!isValidEmail(email))
    return NextResponse.json({ error: "Невалиден имейл" }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json(
      { error: "Паролата трябва да е поне 8 символа" },
      { status: 400 }
    );

  const existing = await getUserByEmail(email);
  if (existing) {
    return NextResponse.json(
      { error: "Вече съществува профил с този имейл" },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);
  const isAdmin = isAdminEmail(email);
  const user = await createWebUser({ email, passwordHash, name, isAdmin });

  // Промотираме до админ ако имейлът е в ADMIN_EMAILS, но createWebUser вече
  // го прави. Все пак презаписваме, в случай че имаме съществуващ ред.
  if (isAdmin && !user.isAdmin) {
    await db.update(usersTable).set({ isAdmin: true }).where(eq(usersTable.id, user.id));
  }

  const token = await createSession({
    userId: user.id,
    email,
    isAdmin,
    name,
  });
  await setSessionCookie(token);
  return NextResponse.json({ ok: true });
}
