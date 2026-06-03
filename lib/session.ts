// Помощно: изисква вход, иначе redirect към /login. Връща сесията.

import "server-only";
import { redirect } from "next/navigation";
import { readSession, type SessionData } from "./auth";

export async function requireSession(): Promise<SessionData> {
  const session = await readSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdmin(): Promise<SessionData> {
  const session = await requireSession();
  if (!session.isAdmin) redirect("/");
  return session;
}
