import { VENDORS, type Vendor } from "@activen/domain";
import { useI18n } from "../../i18n/I18nContext.js";
import { VENDOR_NAMES } from "../../lib/vendors.js";
import { FormatFields } from "../../settings/FormatFields.js";
import { SettingsError } from "../../settings/SettingsError.js";
import { useSettingsEditor } from "../../settings/useSettingsEditor.js";
import { Icon } from "../../ui/Icon.js";
import { Section } from "./Section.js";

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
  const order = settings.sourcePriority;
  const move = (i: number, dir: -1 | 1) => {
    const next = [...order];
    const [item] = next.splice(i, 1);
    if (!item) return;
    next.splice(i + dir, 0, item);
    void save({ sourcePriority: next });
  };
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
      <Section title={t("profile.sources")} info={order.map((v) => VENDOR_NAMES[v]).join(" › ")}>
        <p className="small muted">{t("profile.sourcesHint")}</p>
        <ol className="list" style={{ padding: 0, margin: 0, listStyle: "none" }}>
          {order.map((v, i) => (
            <li key={v} className="list-item">
              <span className="chip num">{i + 1}</span>
              <span className="grow">{VENDOR_NAMES[v] ?? v}</span>
              <button
                type="button"
                className="icon-btn"
                disabled={saving || i === 0}
                aria-label={`${t("profile.moveUp")}: ${VENDOR_NAMES[v]}`}
                onClick={() => move(i, -1)}
              >
                <Icon name="arrowUp" size={18} />
              </button>
              <button
                type="button"
                className="icon-btn"
                disabled={saving || i === order.length - 1}
                aria-label={`${t("profile.moveDown")}: ${VENDOR_NAMES[v]}`}
                onClick={() => move(i, 1)}
              >
                <Icon name="arrowDown" size={18} />
              </button>
            </li>
          ))}
        </ol>
      </Section>
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
