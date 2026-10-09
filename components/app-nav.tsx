"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./theme-toggle";
import { IconBell, IconChat, IconHistory, IconHome } from "./icons";

const ITEMS = [
  { href: "/", label: "Днес", Icon: IconHome },
  { href: "/chat", label: "Чат", Icon: IconChat },
  { href: "/history", label: "История", Icon: IconHistory },
  { href: "/settings", label: "Настройки", Icon: IconBell },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export default function AppNav({
  loggedIn,
  isAdmin,
}: {
  loggedIn: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname() || "/";

  return (
    <>
      <header className="flex items-center justify-between gap-3 py-3 border-b">
        <Link href="/" className="font-display font-semibold text-xl">
          Life Coach
        </Link>
        <nav className="flex items-center gap-1" aria-label="Основна навигация">
          {loggedIn ? (
            <>
              <div className="hidden md:flex items-center gap-1">
                {ITEMS.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="nav-link"
                    aria-current={isActive(pathname, href) ? "page" : undefined}
                  >
                    {label}
                  </Link>
                ))}
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="nav-link"
                    aria-current={isActive(pathname, "/admin") ? "page" : undefined}
                  >
                    Админ
                  </Link>
                )}
              </div>
              <ThemeToggle />
              <form action="/api/auth/logout" method="post">
                <button className="btn btn-ghost btn-sm">Изход</button>
              </form>
            </>
          ) : (
            <>
              <ThemeToggle />
              <Link href="/login" className="nav-link">
                Вход
              </Link>
              <Link href="/register" className="btn btn-sm">
                Регистрация
              </Link>
            </>
          )}
        </nav>
      </header>

      {loggedIn && (
        <nav className="bottom-nav md:hidden" aria-label="Навигация за телефон">
          {ITEMS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
            >
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
