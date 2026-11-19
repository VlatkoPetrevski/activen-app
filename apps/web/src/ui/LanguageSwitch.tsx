import { SUPPORTED_LOCALES, type Locale } from "@activen/i18n";
import { useI18n } from "../i18n/I18nContext.js";

const NAMES: Record<Locale, string> = { mk: "МК", en: "EN" };

export function LanguageSwitch({ onChange }: { onChange?: (locale: Locale) => void }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="segmented" role="group" aria-label={t("profile.language")}>
      {SUPPORTED_LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={locale === l}
          onClick={() => {
            setLocale(l);
            onChange?.(l);
          }}
        >
          {NAMES[l]}
        </button>
      ))}
    </div>
  );
}
