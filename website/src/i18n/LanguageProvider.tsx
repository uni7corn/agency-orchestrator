import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LANGUAGES, translations, type Language, type Translation } from "./translations";

interface LanguageContextValue {
  lang: Language;
  t: Translation;
  setLang: (lang: Language) => void;
  toggle: () => void;
  prefix: (path: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function detectLang(): Language {
  if (typeof window === "undefined") return "zh";
  // 1. URL path segment (public site /en routes)
  const seg = window.location.pathname.split("/").filter(Boolean)[0];
  if (LANGUAGES.includes(seg as Language)) return seg as Language;
  // 2. 用户显式切换过 → 持久化优先（即使下面 launcher 传了 ?lang= 也尊重用户选择）
  const stored = window.localStorage.getItem("ao-lang");
  if (LANGUAGES.includes(stored as Language)) return stored as Language;
  // 3. launcher 提示（桌面端 / `ao web` 按其语言带上 ?lang=zh|en）
  const qp = new URLSearchParams(window.location.search).get("lang");
  if (LANGUAGES.includes(qp as Language)) return qp as Language;
  // 4. 浏览器语言兜底
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(detectLang);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  // 仅在用户「显式切换」时持久化，不在自动检测/launcher 提示时写入。
  // 否则首次随 ?lang= 检测到的值会被存进 localStorage，反过来盖掉之后每次的 launcher 提示，
  // 导致桌面端默认语言改了也不生效（中文产品想默认中文却被旧的 en 卡住）。
  const persist = useCallback((next: Language) => {
    try { window.localStorage.setItem("ao-lang", next); } catch { /* ignore */ }
  }, []);
  const setLang = useCallback((next: Language) => { persist(next); setLangState(next); }, [persist]);
  const toggle = useCallback(() => setLangState((p) => { const n = p === "zh" ? "en" : "zh"; persist(n); return n; }), [persist]);
  const prefix = useCallback((path: string) => (lang === "zh" ? path : `/en${path === "/" ? "" : path}`), [lang]);

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, t: translations[lang], setLang, toggle, prefix }),
    [lang, setLang, toggle, prefix],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
