import { NextRequest, NextResponse } from "next/server";
import { apiAuth, isFailure, jsonError, readJson } from "@/lib/api";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "@/src/core/settings";
import { db, settingsTable } from "@/src/db";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

const ALLOWED_KEYS = ["prompts", "models", "temperatures", "checkin"] as const;

export async function POST(req: NextRequest) {
  const auth = await apiAuth(req, { admin: true });
  if (isFailure(auth)) return auth;
  const body = await readJson(req);
  if (!body) return jsonError("Очаквам обект.", 400);
  // Приемаме само познатите групи настройки.
  const patch: Record<string, unknown> = {};
  for (const k of ALLOWED_KEYS) {
    if (body[k] && typeof body[k] === "object") patch[k] = body[k];
  }
  const next = await saveSettings(patch);
  return NextResponse.json({ ok: true, settings: next });
}

export async function DELETE(req: NextRequest) {
  const auth = await apiAuth(req, { admin: true });
  if (isFailure(auth)) return auth;
  await db.delete(settingsTable).where(eq(settingsTable.key, "main"));
  const settings = await getSettings(true);
  return NextResponse.json({ ok: true, settings: { ...settings, ...DEFAULT_SETTINGS } });
}
