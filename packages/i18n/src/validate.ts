import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { SUPPORTED_LOCALES, type Locale } from "./locales.js";
import { CATALOGS } from "./translate.js";

export interface CatalogIssue {
  locale: string;
  key: string;
  problem: "MISSING" | "EXTRA" | "EMPTY" | "SYNTAX" | "PLACEHOLDERS";
  detail?: string;
}

/** Names of all arguments used in an ICU message (`{name}`, plural/select arguments, nested). */
export function messageArguments(message: string): Set<string> {
  const names = new Set<string>();
  const walk = (elements: MessageFormatElement[]) => {
    for (const el of elements) {
      if (
        el.type === TYPE.argument ||
        el.type === TYPE.number ||
        el.type === TYPE.date ||
        el.type === TYPE.time
      )
        names.add(el.value);
      if (el.type === TYPE.plural || el.type === TYPE.select) {
        names.add(el.value);
        for (const opt of Object.values(el.options)) walk(opt.value);
      }
      if (el.type === TYPE.tag) walk(el.children);
    }
  };
  walk(parse(message));
  return names;
}

const sameSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((x) => b.has(x));

/**
 * Checks every catalog against the English source: same keys, non-empty, valid ICU syntax and the
 * same placeholders (a translation must not drop or invent `{count}`, `{name}` …).
 */
export function validateCatalogs(
  catalogs: Readonly<Record<string, Readonly<Record<string, string>>>> = CATALOGS,
  source: Locale = "en",
): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const base = catalogs[source] ?? {};
  const sourceArgs = new Map<string, Set<string>>();
  for (const [key, msg] of Object.entries(base)) {
    try {
      sourceArgs.set(key, messageArguments(msg));
    } catch (e) {
      issues.push({ locale: source, key, problem: "SYNTAX", detail: String(e) });
    }
  }
  for (const [locale, messages] of Object.entries(catalogs)) {
    if (locale === source) continue;
    for (const key of Object.keys(base)) {
      const msg = messages[key];
      if (msg === undefined) {
        issues.push({ locale, key, problem: "MISSING" });
        continue;
      }
      if (!msg.trim()) {
        issues.push({ locale, key, problem: "EMPTY" });
        continue;
      }
      let args: Set<string>;
      try {
        args = messageArguments(msg);
      } catch (e) {
        issues.push({ locale, key, problem: "SYNTAX", detail: String(e) });
        continue;
      }
      const expected = sourceArgs.get(key);
      if (expected && !sameSet(args, expected))
        issues.push({
          locale,
          key,
          problem: "PLACEHOLDERS",
          detail: `expected {${[...expected].join(", ")}}, got {${[...args].join(", ")}}`,
        });
    }
    for (const key of Object.keys(messages))
      if (!(key in base)) issues.push({ locale, key, problem: "EXTRA" });
  }
  return issues;
}

/** Locales whose catalogs are complete (no MISSING/EMPTY issues). */
export function completeLocales(): Locale[] {
  const issues = validateCatalogs();
  return SUPPORTED_LOCALES.filter(
    (l) =>
      !issues.some((i) => i.locale === l && (i.problem === "MISSING" || i.problem === "EMPTY")),
  );
}
