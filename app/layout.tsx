import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { readSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Life Coach",
  description: "Личен AI коуч за навици, вярвания и идентичност.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readSession();
  return (
    <html lang="bg">
      <body>
        <div className="max-w-5xl mx-auto px-4">
          <header className="flex items-center justify-between py-4 border-b">
            <Link href="/" className="font-semibold text-lg">
              Life Coach
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              {session ? (
                <>
                  <Link href="/" className="hover:opacity-80">
                    Табло
                  </Link>
                  <Link href="/chat" className="hover:opacity-80">
                    Чат
                  </Link>
                  <Link href="/history" className="hover:opacity-80">
                    История
                  </Link>
                  <Link href="/link-telegram" className="hover:opacity-80">
                    Telegram
                  </Link>
                  {session.isAdmin && (
                    <Link href="/admin" className="hover:opacity-80">
                      Админ
                    </Link>
                  )}
                  <form action="/api/auth/logout" method="post">
                    <button className="btn-ghost btn">Изход</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" className="hover:opacity-80">
                    Вход
                  </Link>
                  <Link href="/register" className="btn">
                    Регистрация
                  </Link>
                </>
              )}
            </nav>
          </header>
          <main className="py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
