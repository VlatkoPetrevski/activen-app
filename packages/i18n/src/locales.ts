/**
 * Supported UI languages. Adding a language = a new messages file with every key (tests enforce
 * parity) + its entry here. Planned next (docs/adr/0008): Albanian (sq), Serbian, Bulgarian, German.
 */
export const SUPPORTED_LOCALES = ["mk", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Default for new users when nothing else is known (primary market: North Macedonia). */
export const DEFAULT_LOCALE: Locale = "mk";

/** Language every message falls back to when a translation is missing. */
export const FALLBACK_LOCALE: Locale = "en";

export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Maps a BCP-47 tag to a supported locale by its primary language ("mk-MK" → "mk"). */
export function matchLocale(tag: string): Locale | null {
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  return isLocale(primary) ? primary : null;
}

/** Parses an HTTP `Accept-Language` header into tags ordered by quality (q), highest first. */
export function parseAcceptLanguage(header: string): string[] {
  return header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((x) => x.tag && x.tag !== "*" && x.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((x) => x.tag);
}

export interface LocaleSources {
  /** Explicit choice in the athlete's profile. */
  userPreference?: string | null;
  /** Browser/OS preference (`Accept-Language` header or `navigator.languages`). */
  acceptLanguage?: string | readonly string[] | null;
}

/**
 * Picks the UI language: profile setting → device preferences → default (mk).
 * Unsupported values are skipped rather than failing.
 */
export function negotiateLocale(sources: LocaleSources): Locale {
  if (sources.userPreference) {
    const match = matchLocale(sources.userPreference);
    if (match) return match;
  }
  const device =
    typeof sources.acceptLanguage === "string"
      ? parseAcceptLanguage(sources.acceptLanguage)
      : (sources.acceptLanguage ?? []);
  for (const tag of device) {
    const match = matchLocale(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}
