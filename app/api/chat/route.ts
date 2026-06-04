import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import {
  endDeep,
  finalizeOnboarding,
  handleUserMessage,
  startDeep,
  startOrientation,
} from "@/src/core/coach";
import { getUserById } from "@/src/memory";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await requireSession();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Невалиден JSON" }, { status: 400 });
  }

  const action = String(body.action || "message");
  const user = await getUserById(session.userId);
  if (!user) {
    return NextResponse.json({ error: "Профилът не е намерен" }, { status: 404 });
  }

  try {
    if (action === "message") {
      const text = String(body.text || "").trim();
      if (!text) {
        return NextResponse.json({ error: "Празно съобщение" }, { status: 400 });
      }
      const reply = await handleUserMessage(session.userId, text, {
        onboardingStage: user.onboardingStage,
        mode: user.mode,
      });
      return NextResponse.json(reply);
    }
    if (action === "start_orientation") {
      const reply = await startOrientation(session.userId);
      return NextResponse.json(reply);
    }
    if (action === "finalize_onboarding") {
      const reply = await finalizeOnboarding(session.userId);
      return NextResponse.json(reply);
    }
    if (action === "start_deep") {
      const topic = String(body.topic || "").trim();
      const reply = await startDeep(session.userId, topic);
      return NextResponse.json(reply);
    }
    if (action === "end_deep") {
      const reply = await endDeep(session.userId);
      return NextResponse.json(reply);
    }
    return NextResponse.json({ error: "Непознато действие" }, { status: 400 });
  } catch (err: any) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: err?.message || "Сървърна грешка" },
      { status: 500 }
    );
  }
}
