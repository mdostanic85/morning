"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { Switch } from "@heroui/react/switch";
import { cn } from "@/lib/utils";

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

  function handleChange(selected: boolean) {
    const nextTheme: Theme = selected ? "dark" : "light";
    applyTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    setTheme(nextTheme);
  }

  return (
    <div
      className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface/75 px-2.5 py-1.5"
      title={`Use ${dark ? "light" : "dark"} theme`}
    >
      <SunIcon
        className={cn("size-3.5", dark ? "text-muted-soft" : "text-sun-foreground")}
        aria-hidden
      />
      <Switch
        size="sm"
        isSelected={dark}
        onChange={handleChange}
        isDisabled={!mounted}
        aria-label={`Use ${dark ? "light" : "dark"} theme`}
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Content>
      </Switch>
      <MoonIcon
        className={cn("size-3.5", dark ? "text-accent-strong" : "text-muted-soft")}
        aria-hidden
      />
      <span className="sr-only" aria-live="polite">
        {dark ? "Dark theme active" : "Light theme active"}
      </span>
    </div>
  );
}
