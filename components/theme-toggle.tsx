"use client";

import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "./icons";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Ръчно превключване светла/тъмна тема (по подразбиране следва системата).
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("lc-theme", next);
    } catch {
      // localStorage може да е недостъпен — темата важи за сесията.
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-ghost btn-sm"
      aria-label={theme === "dark" ? "Превключи към светла тема" : "Превключи към тъмна тема"}
      title={theme === "dark" ? "Светла тема" : "Тъмна тема"}
    >
      {theme === "dark" ? <IconSun /> : <IconMoon />}
    </button>
  );
}
