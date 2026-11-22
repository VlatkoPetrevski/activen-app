import { HR_ZONE_KEYS, lowerBoundsFromMax, manualZones, type HrZonesDto } from "@activen/contracts";
import { VENDORS, type HrZone, type Vendor } from "@activen/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useApi } from "../../api/ApiContext.js";
import { useI18n } from "../../i18n/I18nContext.js";
import { VENDOR_NAMES } from "../../lib/vendors.js";
import type { SettingsEditor } from "../../settings/useSettingsEditor.js";
import { Section } from "./Section.js";

const APPS = VENDORS.filter((v): v is Exclude<Vendor, "manual"> => v !== "manual");

/** "до 128", "129–144", "168+" — the zone's range in beats per minute. */
function rangeText(z: HrZone): string {
  if (z.minBpm === null) return `< ${(z.maxBpm ?? 0) + 1}`;
  if (z.maxBpm === null) return `${z.minBpm}+`;
  return `${z.minBpm}–${z.maxBpm}`;
}

/** The five zones as one colored bar and a row per zone: number, name, what it trains, range. */
function ZoneList({
  zones,
  maxHeartRate,
  edit,
}: {
  zones: readonly HrZone[];
  maxHeartRate: number | null;
  /** Manual mode: the lower bound of zones 2–5 can be typed in each row. */
  edit?: { bounds: string[]; onChange(i: number, v: string): void } | undefined;
}) {
  const { t } = useI18n();
  const top = maxHeartRate ?? (zones.at(-1)?.minBpm ?? 180) + 15;
  const bottom = Math.max(60, (zones[1]?.minBpm ?? 100) - 25);
  const width = (z: HrZone) =>
    Math.max(6, ((z.maxBpm ?? top) - Math.max(z.minBpm ?? bottom, bottom) + 1) / (top - bottom));
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="zone-bar" aria-hidden>
        {zones.map((z, i) => (
          <span key={i} style={{ background: z.color, flexGrow: width(z) }} />
        ))}
      </div>
      <ol className="zone-list">
        {zones.map((z, i) => {
          const key = HR_ZONE_KEYS[i];
          return (
            <li key={i} className="zone-row" style={{ borderLeftColor: z.color }}>
              <span className="zone-num" style={{ background: z.color }}>
                Z{i + 1}
              </span>
              <span className="grow stack" style={{ gap: 0 }}>
                <strong>{key ? t(`hrZone.${key}`) : z.name}</strong>
                {key && <span className="tiny muted">{t(`hrZone.${key}.hint`)}</span>}
              </span>
              {edit && i > 0 ? (
                <span className="zone-edit">
                  <input
                    className="input num"
                    inputMode="numeric"
                    aria-label={t("hrZone.from", { zone: i + 1 })}
                    value={edit.bounds[i - 1] ?? ""}
                    onChange={(e) => edit.onChange(i - 1, e.target.value)}
                  />
                  <span className="tiny muted" aria-hidden>
                    +
                  </span>
                </span>
              ) : (
                <span className="num small zone-range">{rangeText(z)}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Profile › HR zones: from a connected app (automatically by source priority, or always one app)
 * or the athlete's own zones. Five zones in color with their physiological meaning.
 */
export function HrZonesSection({ editor }: { editor: SettingsEditor }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { settings, save, saving } = editor;
  const hr = settings.hrZones;
  const query = useQuery({ queryKey: ["me", "hr-zones"], queryFn: () => api.hrZones() });
  const data: HrZonesDto | undefined = query.data;
  const manual = hr.mode === "manual";
  const [bounds, setBounds] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "invalid" | "error">("idle");

  // The fields start from the zones in use (or % of max HR when there are none).
  useEffect(() => {
    if (!data) return;
    const fromZones = data.zones.slice(1).map((z) => String(z.minBpm ?? ""));
    setBounds(
      fromZones.length === 4
        ? fromZones
        : data.maxHeartRate
          ? lowerBoundsFromMax(data.maxHeartRate).map(String)
          : ["", "", "", ""],
    );
  }, [data]);

  // Manual: the list previews the typed bounds as soon as they make five valid zones.
  const preview = (() => {
    if (!manual) return data?.zones ?? [];
    try {
      return manualZones(bounds.map((b) => Number(b.trim())));
    } catch {
      return data?.zones ?? [];
    }
  })();

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["me", "hr-zones"] });
  const setMode = async (next: typeof hr) => {
    await save({ hrZones: next });
    await refresh();
  };
  const saveOwn = async () => {
    const values = bounds.map((b) => Number(b.trim()));
    const valid =
      values.length === 4 &&
      values.every(
        (v, i) =>
          Number.isInteger(v) && v >= 60 && v <= 240 && (i === 0 || v > (values[i - 1] ?? 0)),
      );
    if (!valid) return setState("invalid");
    setState("saving");
    try {
      const next = await api.saveHrZones(values);
      queryClient.setQueryData(["me", "hr-zones"], next);
      await editor.save({ hrZones: { mode: "manual" } });
      setState("saved");
    } catch {
      setState("error");
    }
  };

  const origin = !data
    ? undefined
    : data.zones.length === 0
      ? t("hrZone.origin.none")
      : data.origin === "manual"
        ? t("hrZone.origin.manual")
        : data.origin === "vendor" && data.source
          ? t("hrZone.origin.vendor", { vendor: VENDOR_NAMES[data.source] })
          : t("hrZone.origin.default", { max: data.maxHeartRate ?? "—" });

  return (
    <Section title={t("profile.hrZones")} info={origin}>
      <div className="stack-l">
        <div className="chips" role="group" aria-label={t("profile.hrZones")}>
          <button
            type="button"
            className="chip chip-button"
            aria-pressed={!manual}
            disabled={saving}
            onClick={() => void setMode({ mode: "source" })}
          >
            {t("hrZone.mode.app")}
          </button>
          <button
            type="button"
            className="chip chip-button"
            aria-pressed={manual}
            disabled={saving}
            onClick={() => void setMode({ mode: "manual" })}
          >
            {t("hrZone.mode.manual")}
          </button>
        </div>

        {!manual && (
          <div className="setting-row">
            <label htmlFor="hr-app">{t("hrZone.app")}</label>
            <select
              id="hr-app"
              className="input setting-control wide"
              value={hr.mode === "vendor" ? hr.vendor : "auto"}
              disabled={saving}
              onChange={(e) =>
                void setMode(
                  e.target.value === "auto"
                    ? { mode: "source" }
                    : { mode: "vendor", vendor: e.target.value as Exclude<Vendor, "manual"> },
                )
              }
            >
              <option value="auto">{t("hrZone.app.auto")}</option>
              {APPS.map((v) => (
                <option key={v} value={v}>
                  {VENDOR_NAMES[v]}
                </option>
              ))}
            </select>
          </div>
        )}

        {data && (data.fellBack || (data.origin === "garmin_default" && data.zones.length > 0)) && (
          <p className="small muted">{t("hrZone.fellBack", { max: data.maxHeartRate ?? "—" })}</p>
        )}
        {data && data.zones.length === 0 && !manual && (
          <p className="small muted">{t("hrZone.none")}</p>
        )}

        {data && preview.length > 0 && (
          <ZoneList
            zones={preview}
            maxHeartRate={data.maxHeartRate}
            edit={
              manual
                ? {
                    bounds,
                    onChange: (i, v) => {
                      setBounds((b) => b.map((x, j) => (j === i ? v : x)));
                      setState("idle");
                    },
                  }
                : undefined
            }
          />
        )}

        {manual && (
          <div className="stack" style={{ gap: 8 }}>
            <p className="tiny muted">{t("hrZone.editHint")}</p>
            {state === "invalid" && (
              <p className="small" role="alert" style={{ color: "var(--bad)" }}>
                {t("hrZone.invalid")}
              </p>
            )}
            {state === "error" && (
              <p className="small" role="alert" style={{ color: "var(--bad)" }}>
                {t("common.error")}
              </p>
            )}
            {state === "saved" && (
              <p className="small" role="status">
                {t("hrZone.saved")}
              </p>
            )}
            <div className="row wrap">
              <button
                type="button"
                className="btn btn-primary btn-small"
                disabled={state === "saving"}
                onClick={() => void saveOwn()}
              >
                {t("hrZone.save")}
              </button>
              {data?.maxHeartRate && (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => {
                    setBounds(lowerBoundsFromMax(data.maxHeartRate ?? 0).map(String));
                    setState("idle");
                  }}
                >
                  {t("hrZone.fromMax", { max: data.maxHeartRate })}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="setting-group">
          <div className="setting-row">
            <label htmlFor="maxhr">{t("profile.maxHr")}</label>
            <input
              id="maxhr"
              className="input num setting-control narrow"
              type="number"
              min={100}
              max={250}
              defaultValue={settings.maxHeartRate ?? ""}
              onBlur={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                if (v !== settings.maxHeartRate && (v === null || (v >= 100 && v <= 250)))
                  void save({ maxHeartRate: v }).then(refresh);
              }}
            />
          </div>
          <div className="setting-row">
            <label htmlFor="birth">{t("profile.birthDate")}</label>
            <input
              id="birth"
              className="input setting-control wide"
              type="date"
              defaultValue={settings.birthDate ?? ""}
              onBlur={(e) => {
                const v = e.target.value || null;
                if (v !== settings.birthDate) void save({ birthDate: v }).then(refresh);
              }}
            />
          </div>
          <p className="tiny muted">{t("hrZone.maxHint")}</p>
        </div>
      </div>
    </Section>
  );
}
