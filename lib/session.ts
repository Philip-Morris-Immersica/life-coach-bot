// Помощно: изисква вход, иначе redirect към /login. Връща сесията.

import "server-only";
import { redirect } from "next/navigation";
import { readSession, type SessionData } from "./auth";
import { getUserById } from "@/src/memory";

export async function requireSession(): Promise<SessionData> {
  const session = await readSession();
  if (!session) redirect("/login");
  return session;
}

// Админ правата се проверяват в базата (не се вярва на JWT до изтичането му).
export async function requireAdmin(): Promise<SessionData> {
  const session = await requireSession();
  const user = await getUserById(session.userId);
  if (!user?.isAdmin) redirect("/");
  return session;
}
