import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "@/src/core/settings";
import { db, settingsTable } from "@/src/db";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  await requireAdmin();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Невалиден JSON" }, { status: 400 });
  }
  // Лек sanity check за типове.
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Очаквам обект" }, { status: 400 });
  }
  const next = await saveSettings(body);
  return NextResponse.json({ ok: true, settings: next });
}

export async function DELETE() {
  await requireAdmin();
  await db.delete(settingsTable).where(eq(settingsTable.key, "main"));
  const settings = await getSettings(true);
  return NextResponse.json({ ok: true, settings: { ...settings, ...DEFAULT_SETTINGS } });
}
