import { useI18n } from "../../i18n/I18nContext.js";
import { FormatFields } from "../../settings/FormatFields.js";
import { SettingsError } from "../../settings/SettingsError.js";
import { useSettingsEditor } from "../../settings/useSettingsEditor.js";
import { Section } from "./Section.js";
import { HrZonesSection } from "./HrZonesSection.js";
import { SourcesSection } from "./SourcesSection.js";

const TIME_ZONES = (() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["Europe/Skopje"];
  }
})();

/** Preferences: language and units, planning, data sources, heart-rate zones. */
export function PreferenceSections() {
  const { t, locale } = useI18n();
  const editor = useSettingsEditor();
  const { settings, save, saving, error } = editor;
  return (
    <>
      <Section
        title={t("profile.language")}
        info={`${locale.toUpperCase()} · ${t(`profile.units.${settings.unitSystem}`)}`}
      >
        <div className="form-grid">
          <FormatFields editor={editor} hint />
          <div className="field full">
            <label htmlFor="tz">{t("profile.timeZone")}</label>
            <select
              id="tz"
              className="input"
              value={settings.timeZone}
              disabled={saving}
              onChange={(e) => void save({ timeZone: e.target.value })}
            >
              {TIME_ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Section>
      <Section
        title={t("profile.planning")}
        info={t(settings.workoutSuggestions ? "profile.suggestions.on" : "profile.suggestions.off")}
      >
        <label className="check">
          <input
            type="checkbox"
            checked={settings.workoutSuggestions}
            disabled={saving}
            onChange={(e) => void save({ workoutSuggestions: e.target.checked })}
          />
          {t("profile.suggestions")}
        </label>
        <p className="small muted">{t("profile.suggestionsHint")}</p>
      </Section>
      <Section
        title={t("profile.notifications")}
        info={
          settings.briefingReminder.enabled
            ? t("profile.briefing.on", { time: settings.briefingReminder.time })
            : t("profile.briefing.off")
        }
      >
        {/* One setting per row: the choice on the left, its control on the right, the hint below. */}
        <div className="setting-group">
          <label className="check">
            <input
              type="checkbox"
              checked={settings.briefingReminder.enabled}
              disabled={saving}
              onChange={(e) =>
                void save({
                  briefingReminder: { ...settings.briefingReminder, enabled: e.target.checked },
                })
              }
            />
            {t("profile.briefingEmail")}
          </label>
          <div className="setting-row">
            <label htmlFor="briefing-time">{t("profile.briefingTime")}</label>
            <input
              id="briefing-time"
              className="input num setting-control"
              type="time"
              step={300}
              defaultValue={settings.briefingReminder.time}
              disabled={saving}
              onBlur={(e) => {
                const time = e.target.value.slice(0, 5);
                if (
                  /^([01]\d|2[0-3]):[0-5]\d$/.test(time) &&
                  time !== settings.briefingReminder.time
                )
                  void save({ briefingReminder: { ...settings.briefingReminder, time } });
              }}
            />
          </div>
          <p className="small muted">{t("profile.briefingHint")}</p>
        </div>
        <div className="setting-group">
          <div className="setting-row">
            <label htmlFor="sleep-need">{t("profile.sleepNeed")}</label>
            <input
              id="sleep-need"
              className="input num setting-control narrow"
              type="number"
              min={5}
              max={12}
              step={0.25}
              defaultValue={settings.sleepNeedMinutes / 60}
              onBlur={(e) => {
                const minutes = Math.round(Number(e.target.value) * 60);
                if (minutes >= 300 && minutes <= 720 && minutes !== settings.sleepNeedMinutes)
                  void save({ sleepNeedMinutes: minutes });
              }}
            />
          </div>
          <p className="small muted">{t("profile.sleepNeedHint")}</p>
        </div>
      </Section>
      <SourcesSection editor={editor} />
      <HrZonesSection editor={editor} />
      <SettingsError show={error} />
    </>
  );
}
