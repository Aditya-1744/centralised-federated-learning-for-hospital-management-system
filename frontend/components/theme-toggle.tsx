"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

// A separate, additive component rather than a change to
// components/ui/animated-nav-framer.tsx -- that file is used exactly as
// react_components_spec.md provided it (CLAUDE.md's React Compliance rule),
// so the toggle lives beside it instead of inside it.
//
// No mount-guard needed: this only ever renders inside the dashboard tree,
// which app/page.tsx loads with `ssr: false` (see its comment), so there's no
// server-rendered version of this component for the resolved theme to
// mismatch against.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="fixed top-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full border bg-background/80 shadow-lg backdrop-blur-sm transition-colors hover:bg-background"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
