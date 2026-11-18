import { IntlMessageFormat } from "intl-messageformat";
import { FALLBACK_LOCALE, type Locale } from "./locales.js";
import { en, type MessageKey } from "./messages/en.js";
import { mk } from "./messages/mk.js";

export type Messages = Readonly<Record<MessageKey, string>>;

export const CATALOGS: Readonly<Record<Locale, Messages>> = Object.freeze({ en, mk });

export type MessageValues = Record<string, string | number | Date | boolean>;

export interface Translator {
  readonly locale: Locale;
  /** Formats a message. Missing translations fall back to English, then to the key itself. */
  t(key: MessageKey, values?: MessageValues): string;
  /** True when the key has a non-empty translation in this locale (no fallback). */
  has(key: string): key is MessageKey;
}

export interface TranslatorOptions {
  /** Called once per missing key/locale, e.g. to log or count missing translations. */
  onMissing?: (key: string, locale: Locale) => void;
  /** Catalogs to use instead of the built-in ones (tests, preview of new translations). */
  catalogs?: Partial<Record<Locale, Partial<Record<string, string>>>>;
}

/**
 * Creates a translator for one locale. Compiled ICU messages are cached per translator, so create
 * one per request/user and reuse it.
 */
export function createTranslator(locale: Locale, options: TranslatorOptions = {}): Translator {
  const catalogs = { ...CATALOGS, ...options.catalogs } as Record<
    Locale,
    Partial<Record<string, string>>
  >;
  const cache = new Map<string, IntlMessageFormat>();
  const reported = new Set<string>();

  const lookup = (key: string): { source: string; locale: Locale } | null => {
    const own = catalogs[locale]?.[key];
    if (own) return { source: own, locale };
    if (!reported.has(key)) {
      reported.add(key);
      options.onMissing?.(key, locale);
    }
    const fallback = catalogs[FALLBACK_LOCALE]?.[key];
    return fallback ? { source: fallback, locale: FALLBACK_LOCALE } : null;
  };

  return {
    locale,
    has(key: string): key is MessageKey {
      return Boolean(catalogs[locale]?.[key]);
    },
    t(key, values) {
      const found = lookup(key);
      if (!found) return key;
      const cacheKey = `${found.locale}\u0000${key}`;
      let fmt = cache.get(cacheKey);
      if (!fmt) {
        fmt = new IntlMessageFormat(found.source, found.locale);
        cache.set(cacheKey, fmt);
      }
      return String(fmt.format(values));
    },
  };
}
