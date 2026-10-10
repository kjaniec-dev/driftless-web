import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { storage } from "@/lib/storage";
import { type Dictionary, en } from "./en";
import { pl } from "./pl";

export type Lang = "pl" | "en";
const dictionaries: Record<Lang, Dictionary> = { en, pl };
const STORAGE_KEY = "driftless.lang";

export function detectLang(): Lang {
  const saved = storage.get(STORAGE_KEY);
  if (saved === "pl" || saved === "en") return saved;
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("pl")
    ? "pl"
    : "en";
}

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Dictionary;
  /** Replaces `{name}` placeholders. */
  format: (template: string, values: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(initial ?? detectLang);
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    storage.set(STORAGE_KEY, next);
    document.documentElement.lang = next;
  }, []);
  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: dictionaries[lang],
      format: (template, values) =>
        template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`)),
    }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}
