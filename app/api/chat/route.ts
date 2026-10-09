import { NextRequest, NextResponse } from "next/server";
import { apiAuth, isFailure, jsonError, limited, readJson } from "@/lib/api";
import {
  endSession,
  finalizeOnboarding,
  handleUserMessage,
  startCheckin,
  startDeep,
  startOrientation,
  startShort,
} from "@/src/core/coach";
import { checkDailyLimit, LIMIT_MESSAGE, MAX_MESSAGE_CHARS } from "@/src/core/limits";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await apiAuth(req);
  if (isFailure(auth)) return auth;
  const { user } = auth;

  // Защита на разхода: по потребител, на минута.
  const rl = limited(req, "chat", 20, 60_000, user.id);
  if (rl) return rl;

  const body = await readJson(req);
  if (!body) return jsonError("Невалидна заявка.", 400);
  const action = String(body.action || "message");

  const limit = await checkDailyLimit(user.id);
  if (!limit.ok) return jsonError(LIMIT_MESSAGE, 429);

  try {
    switch (action) {
      case "message": {
        const text = String(body.text || "").trim();
        if (!text) return jsonError("Празно съобщение.", 400);
        if (text.length > MAX_MESSAGE_CHARS) {
          return jsonError(`Съобщението е твърде дълго (макс. ${MAX_MESSAGE_CHARS} знака).`, 400);
        }
        return NextResponse.json(
          await handleUserMessage(user.id, text, {
            onboardingStage: user.onboardingStage,
            mode: user.mode,
          })
        );
      }
      case "start_orientation":
        return NextResponse.json(await startOrientation(user.id));
      case "finalize_onboarding":
        return NextResponse.json(await finalizeOnboarding(user.id));
      case "start_deep":
        return NextResponse.json(
          await startDeep(user.id, String(body.topic || "").trim().slice(0, 200))
        );
      case "start_short":
        return NextResponse.json(
          await startShort(user.id, String(body.topic || "").trim().slice(0, 200))
        );
      case "start_checkin":
        return NextResponse.json(await startCheckin(user.id));
      case "end_deep":
        return NextResponse.json(await endSession(user.id, "deep"));
      case "end_short":
        return NextResponse.json(await endSession(user.id, "short"));
      default:
        return jsonError("Непознато действие.", 400);
    }
  } catch (err) {
    // Подробностите остават в логовете; към клиента не изтича вътрешна информация.
    console.error("Chat API error:", err);
    return jsonError("Нещо се обърка при коуча. Опитай отново след малко.", 500);
  }
}
