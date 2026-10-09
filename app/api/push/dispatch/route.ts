import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { dispatchReminder } from "@/src/notifications/dispatch";
import { dbDispatchStore } from "@/src/notifications/store";
import { sendPush } from "@/src/notifications/webpush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Извиква се САМО от QStash (подписана заявка) в часа на напомнянето.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("upstash-signature");
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!signature || !current || !next) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.text();
  try {
    const receiver = new Receiver({
      currentSigningKey: current,
      nextSigningKey: next,
    });
    const valid = await receiver.verify({ signature, body: raw });
    if (!valid) throw new Error("invalid");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let reminderId = "";
  try {
    reminderId = String(JSON.parse(raw)?.reminderId || "");
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!UUID_RE.test(reminderId)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    const result = await dispatchReminder(reminderId, {
      store: dbDispatchStore,
      send: sendPush,
    });
    // 5xx => QStash ще опита пак (claim е освободен, няма дубликати).
    if (result.status === "retry") {
      return NextResponse.json(result, { status: 503 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("dispatch error:", err);
    return NextResponse.json({ error: "Dispatch failed" }, { status: 500 });
  }
}
