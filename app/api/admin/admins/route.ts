import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { apiAuth, isFailure, jsonError, readJson } from "@/lib/api";
import { db, usersTable } from "@/src/db";

export const runtime = "nodejs";

// Дава или отнема админски права по имейл.
export async function POST(req: NextRequest) {
  const auth = await apiAuth(req, { admin: true });
  if (isFailure(auth)) return auth;
  const body = await readJson(req);
  const email = String(body?.email || "").trim().toLowerCase();
  const makeAdmin = Boolean(body?.makeAdmin);
  if (!email) return jsonError("Липсва имейл.", 400);
  // Не позволяваме да си отнемеш правата сам (за да не остане сайтът без админ).
  if (!makeAdmin && auth.user.email?.toLowerCase() === email) {
    return jsonError("Не можеш да отнемеш админските права на себе си.", 400);
  }
  const rows = await db
    .update(usersTable)
    .set({ isAdmin: makeAdmin })
    .where(eq(usersTable.email, email))
    .returning({ id: usersTable.id, email: usersTable.email });
  if (!rows[0]) return jsonError("Няма потребител с този имейл.", 404);
  return NextResponse.json({ ok: true, user: rows[0], isAdmin: makeAdmin });
}
