import { useCallback, useState } from "react";
import { storage } from "./storage";

const KEY = "driftless.theme";

/** The inline script in index.html applies the class before paint; this keeps it in sync. */
export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    storage.set(KEY, next ? "dark" : "light");
    setDark(next);
  }, []);
  return { dark, toggle };
}
