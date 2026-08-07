"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "worklight:theme";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const initialTheme: Theme = root.dataset.theme === "dark" ? "dark" : "light";
    const frame = window.requestAnimationFrame(() => {
      setTheme(initialTheme);
      setMounted(true);
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncWithSystem = (event: MediaQueryListEvent) => {
      if (window.localStorage.getItem(THEME_STORAGE_KEY)) return;
      const nextTheme: Theme = event.matches ? "dark" : "light";
      applyTheme(nextTheme);
      setTheme(nextTheme);
    };
    const syncAcrossTabs = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const nextTheme: Theme =
        event.newValue === "dark"
          ? "dark"
          : event.newValue === "light"
            ? "light"
            : media.matches
              ? "dark"
              : "light";
      applyTheme(nextTheme);
      setTheme(nextTheme);
    };

    media.addEventListener("change", syncWithSystem);
    window.addEventListener("storage", syncAcrossTabs);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", syncWithSystem);
      window.removeEventListener("storage", syncAcrossTabs);
    };
  }, []);

  const dark = theme === "dark";

  function toggleTheme() {
    const nextTheme: Theme = dark ? "light" : "dark";
    applyTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    setTheme(nextTheme);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      disabled={!mounted}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50"
    >
      {dark ? (
        <SunIcon className="size-4" aria-hidden />
      ) : (
        <MoonIcon className="size-4" aria-hidden />
      )}
    </button>
  );
}
