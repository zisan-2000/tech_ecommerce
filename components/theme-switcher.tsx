"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeSwitcher() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const activeTheme =
    theme === "dark" || resolvedTheme === "dark" ? "dark" : "light";

  return (
    <div
      className="inline-flex gap-1 rounded-xl border border-border bg-muted p-1"
      role="group"
      aria-label="Choose color theme"
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-pressed={activeTheme === "light"}
        className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium transition ${
          activeTheme === "light"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Sun className="h-4 w-4" aria-hidden="true" />
        Light
      </button>

      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-pressed={activeTheme === "dark"}
        className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium transition ${
          activeTheme === "dark"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Moon className="h-4 w-4" aria-hidden="true" />
        Dark
      </button>
    </div>
  );
}
