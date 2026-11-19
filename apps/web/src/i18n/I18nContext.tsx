import {
  createFormatter,
  createTranslator,
  isLocale,
  negotiateLocale,
  type Formatter,
  type Locale,
  type MessageKey,
} from "@activen/i18n";
import type { UnitSystem } from "@activen/domain";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type T = (key: MessageKey, values?: Record<string, string | number>) => string;

interface I18n {
  locale: Locale;
  t: T;
  f: Formatter;
  setLocale(locale: Locale): void;
  setUnitSystem(unitSystem: UnitSystem): void;
}

const Ctx = createContext<I18n | null>(null);
const KEY = "activen.locale";

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && isLocale(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  const languages = typeof navigator === "undefined" ? [] : navigator.languages;
  return negotiateLocale({ acceptLanguage: languages.join(",") || null, userPreference: null });
}

export function I18nProvider({
  children,
  locale: fixed,
}: {
  children: ReactNode;
  locale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(fixed ?? initialLocale);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("metric");
  const value = useMemo<I18n>(() => {
    const translator = createTranslator(locale);
    if (typeof document !== "undefined") document.documentElement.lang = locale;
    return {
      locale,
      t: (key, values) => translator.t(key, values),
      f: createFormatter(translator, unitSystem),
      setLocale: (next) => {
        setLocaleState(next);
        try {
          localStorage.setItem(KEY, next);
        } catch {
          /* storage unavailable */
        }
      },
      setUnitSystem,
    };
  }, [locale, unitSystem]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n outside I18nProvider");
  return ctx;
}
