import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { useLang } from "./i18n";

export type Theme = "light" | "dark";

const STORAGE_KEY = "flexoper-theme";

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

type ThemeValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const initial = readStoredTheme();
    if (typeof document !== "undefined") applyTheme(initial);
    return initial;
  });

  const setTheme = (next: Theme) => {
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  };

  const value = useMemo<ThemeValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

export function ThemeSwitch() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useLang();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="icon-button theme-switch"
      onClick={toggleTheme}
      title={t(next === "dark" ? "theme.dark" : "theme.light")}
      aria-label={t("theme.toggle")}
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
