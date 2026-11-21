import { VENDORS, type Vendor } from "@activen/domain";
import { useI18n } from "../../i18n/I18nContext.js";
import { VENDOR_NAMES } from "../../lib/vendors.js";
import { FormatFields } from "../../settings/FormatFields.js";
import { SettingsError } from "../../settings/SettingsError.js";
import { useSettingsEditor } from "../../settings/useSettingsEditor.js";
import { Section } from "./Section.js";
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
  const hr = settings.hrZones;
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
      <SourcesSection editor={editor} />
      <Section
        title={t("profile.hrZones")}
        info={settings.maxHeartRate ? `max ${settings.maxHeartRate}` : undefined}
      >
        <div className="stack" style={{ gap: 0 }}>
          {(["source", "vendor", "manual"] as const).map((mode) => (
            <label key={mode} className="check">
              <input
                type="radio"
                name="hr-mode"
                checked={hr.mode === mode}
                disabled={saving}
                onChange={() =>
                  void save({ hrZones: mode === "vendor" ? { mode, vendor: "garmin" } : { mode } })
                }
              />
              {t(`profile.hrZones.${mode}`)}
            </label>
          ))}
          {hr.mode === "vendor" && (
            <select
              className="input"
              aria-label={t("profile.hrZones.vendor")}
              value={hr.vendor}
              disabled={saving}
              onChange={(e) =>
                void save({
                  hrZones: { mode: "vendor", vendor: e.target.value as Exclude<Vendor, "manual"> },
                })
              }
            >
              {VENDORS.filter((v) => v !== "manual").map((v) => (
                <option key={v} value={v}>
                  {VENDOR_NAMES[v]}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="maxhr">{t("profile.maxHr")}</label>
            <input
              id="maxhr"
              className="input num"
              type="number"
              min={100}
              max={250}
              defaultValue={settings.maxHeartRate ?? ""}
              onBlur={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                if (v !== settings.maxHeartRate && (v === null || (v >= 100 && v <= 250)))
                  void save({ maxHeartRate: v });
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="birth">{t("profile.birthDate")}</label>
            <input
              id="birth"
              className="input"
              type="date"
              defaultValue={settings.birthDate ?? ""}
              onBlur={(e) => {
                const v = e.target.value || null;
                if (v !== settings.birthDate) void save({ birthDate: v });
              }}
            />
          </div>
        </div>
      </Section>
      <SettingsError show={error} />
    </>
  );
}
