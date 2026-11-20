import React, { createContext, useContext, useEffect, useState } from "react";
type Theme = "light" | "dark";
type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void };
const ThemeContext = createContext<ThemeContextValue>({ theme: "dark", setTheme: () => undefined });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => { try { return window.localStorage.getItem("royal-skye-theme") === "light" ? "light" : "dark"; } catch { return "dark"; } });
  useEffect(() => { document.documentElement.dataset.theme = theme; try { window.localStorage.setItem("royal-skye-theme", theme); } catch { /* Session-only fallback. */ } }, [theme]);
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
export function useTheme() { return useContext(ThemeContext); }
