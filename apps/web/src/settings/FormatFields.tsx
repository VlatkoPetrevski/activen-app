import { useI18n } from "../i18n/I18nContext.js";
import { LanguageSwitch } from "../ui/LanguageSwitch.js";
import type { SettingsEditor } from "./useSettingsEditor.js";

/** Language and units — shown in the profile and in the coach settings. */
export function FormatFields({
  editor,
  hint = false,
}: {
  editor: SettingsEditor;
  /** Explain that units apply everywhere. */
  hint?: boolean;
}) {
  const { t } = useI18n();
  const { settings, save, saving } = editor;
  return (
    <>
      <div className="field">
        <span className="label">{t("profile.language")}</span>
        <LanguageSwitch onChange={(locale) => void save({ locale })} />
      </div>
      <div className="field">
        <span className="label">{t("profile.units")}</span>
        <div className="segmented" role="group" aria-label={t("profile.units")}>
          {(["metric", "imperial"] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={settings.unitSystem === u}
              disabled={saving}
              onClick={() => void save({ unitSystem: u })}
            >
              {t(`profile.units.${u}`)}
            </button>
          ))}
        </div>
        {hint && <span className="small muted">{t("profile.units.hint")}</span>}
      </div>
    </>
  );
}
