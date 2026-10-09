// Общи помощници за API route-овете: JSON автентикация (без redirect),
// проверка на произхода (CSRF) и rate limit.

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { readSession, type SessionData } from "./auth";
import { clientIp, rateLimit } from "./rate-limit";
import { getUserById } from "@/src/memory";
import type { User } from "@/src/db";

export function jsonError(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

// Позволяваме само заявки от същия произход (cookie auth + lax cookie).
export function sameOrigin(req: NextRequest): boolean {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const origin = req.headers.get("origin");
  if (!origin) return true; // не-браузърни клиенти / същият произход без header
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export type ApiAuth = { session: SessionData; user: User };

// Връща { session, user } или готов NextResponse с грешка.
// Админ правата се проверяват в базата, не в JWT.
export async function apiAuth(
  req: NextRequest,
  opts: { admin?: boolean } = {}
): Promise<ApiAuth | NextResponse> {
  if (!sameOrigin(req)) return jsonError("Невалиден произход на заявката.", 403);
  const session = await readSession();
  if (!session) return jsonError("Трябва да влезеш в профила си.", 401);
  const user = await getUserById(session.userId);
  if (!user) return jsonError("Профилът не е намерен.", 401);
  if (opts.admin && !user.isAdmin) return jsonError("Нямаш достъп.", 403);
  return { session, user };
}

export function isFailure(v: ApiAuth | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}

export async function readJson(req: NextRequest): Promise<any | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

// Връща NextResponse 429, ако лимитът е надвишен.
export function limited(
  req: NextRequest,
  scope: string,
  limit: number,
  windowMs: number,
  userId?: number
): NextResponse | null {
  const key = `${scope}:${userId ?? clientIp(req.headers)}`;
  const r = rateLimit(key, limit, windowMs);
  if (r.ok) return null;
  const res = jsonError("Твърде много заявки. Опитай отново след малко.", 429);
  res.headers.set("Retry-After", String(r.retryAfterSec));
  return res;
}
