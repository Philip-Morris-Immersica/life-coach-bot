import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { db, usersTable } from "@/src/db";

export const runtime = "nodejs";

// Дава или отнема админски права по имейл.
export async function POST(req: NextRequest) {
  await requireAdmin();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Невалиден JSON" }, { status: 400 });
  }
  const email = String(body.email || "").trim().toLowerCase();
  const makeAdmin = Boolean(body.makeAdmin);
  if (!email) {
    return NextResponse.json({ error: "Липсва имейл" }, { status: 400 });
  }
  const rows = await db
    .update(usersTable)
    .set({ isAdmin: makeAdmin })
    .where(eq(usersTable.email, email))
    .returning({ id: usersTable.id, email: usersTable.email });
  if (!rows[0]) {
    return NextResponse.json(
      { error: "Няма потребител с този имейл" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, user: rows[0], isAdmin: makeAdmin });
}
