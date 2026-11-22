import type { ManualActivityInput } from "@activen/contracts";
import type { ActivityType, LocalDate } from "@activen/domain";
import { useId, useState, type FormEvent } from "react";
import { useI18n } from "../i18n/I18nContext.js";
import { PLAN_SPORTS, sportLabel } from "./labels.js";

const FEEL_EMOJI = ["😫", "😕", "🙂", "😊", "🤩"] as const;
const FEET = 0.3048;

/** The plan's sports first, then other common ones and "Other". */
const SPORTS: ActivityType[] = [
  ...PLAN_SPORTS,
  "MOUNTAIN_BIKING",
  "OPEN_WATER_SWIMMING",
  "ROWING",
  "INDOOR_ROWING",
  "HIIT",
  "PILATES",
  "ELLIPTICAL",
  "CROSS_COUNTRY_SKIING_WS",
  "OTHER",
];
/** Sports without a distance (its fields are hidden). */
const NO_DISTANCE = new Set<ActivityType>([
  "STRENGTH_TRAINING",
  "YOGA",
  "PILATES",
  "HIIT",
  "INDOOR_CARDIO",
]);

interface Draft {
  activityType: ActivityType;
  activityName: string;
  date: string;
  startTime: string;
  hours: string;
  minutes: string;
  seconds: string;
  distance: string;
  elevation: string;
  avgHr: string;
  maxHr: string;
  power: string;
  calories: string;
  effort: number | null;
  feel: number | null;
  comment: string;
}

/** "10,5" and "10.5" both read as 10.5; empty is null; anything else is NaN. */
const num = (v: string): number | null => {
  const s = v.trim().replace(",", ".");
  if (!s) return null;
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
};

type Problem = "duration" | "number" | "hr" | "future";

/**
 * Entering a workout by hand: the sport, when it started and how long it took are required; the
 * rest (distance, pulse, power, calories) and the check-in are optional. A later file of the same
 * workout replaces these numbers and keeps the check-in.
 */
export function ManualActivityForm({
  today,
  onSave,
  onCancel,
}: {
  today: LocalDate;
  onSave(input: ManualActivityInput): Promise<unknown>;
  onCancel(): void;
}) {
  const { t, f } = useI18n();
  const id = useId();
  const now = new Date();
  const [d, setDraft] = useState<Draft>({
    activityType: "RUNNING",
    activityName: "",
    date: today,
    startTime: `${String(now.getHours()).padStart(2, "0")}:00`,
    hours: "",
    minutes: "",
    seconds: "",
    distance: "",
    elevation: "",
    avgHr: "",
    maxHr: "",
    power: "",
    calories: "",
    effort: null,
    feel: null,
    comment: "",
  });
  const [problem, setProblem] = useState<Problem | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((x) => ({ ...x, [key]: value }));
    setProblem(null);
    setState("idle");
  };
  const hasDistance = !NO_DISTANCE.has(d.activityType);
  const imperial = f.unitSystem === "imperial";

  const parse = (): ManualActivityInput | Problem => {
    const parts = [num(d.hours), num(d.minutes), num(d.seconds)];
    if (parts.some((p) => Number.isNaN(p))) return "duration";
    const [h, m, s] = parts.map((p) => p ?? 0) as [number, number, number];
    const durationInSeconds = Math.round(h * 3600 + m * 60 + s);
    if (durationInSeconds < 60 || durationInSeconds > 48 * 3600) return "duration";
    const values = [d.distance, d.elevation, d.avgHr, d.maxHr, d.power, d.calories].map(num);
    if (values.some((v) => Number.isNaN(v))) return "number";
    const [distance, elevation, avgHr, maxHr, power, calories] = values;
    const hrOk = (v: number | null | undefined) => v == null || (v >= 30 && v <= 250);
    if (!hrOk(avgHr) || !hrOk(maxHr) || (avgHr != null && maxHr != null && maxHr < avgHr))
      return "hr";
    if (`${d.date}T${d.startTime}` > `${today}T23:59` || !d.date || !d.startTime) return "future";
    const round = (v: number | null | undefined) => (v == null ? null : Math.round(v));
    return {
      activityType: d.activityType,
      activityName: d.activityName.trim() || null,
      date: d.date,
      startTime: d.startTime,
      durationInSeconds,
      distanceInMeters: hasDistance && distance != null ? Math.round(f.toMeters(distance)) : null,
      totalElevationGainInMeters:
        hasDistance && elevation != null ? round(imperial ? elevation * FEET : elevation) : null,
      averageHeartRateInBeatsPerMinute: round(avgHr),
      maxHeartRateInBeatsPerMinute: round(maxHr),
      averagePowerInWatts: round(power),
      activeKilocalories: round(calories),
      perceivedEffort: d.effort,
      feel: d.feel,
      comment: d.comment.trim() || null,
    };
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const input = parse();
    if (typeof input === "string") return setProblem(input);
    setState("saving");
    try {
      await onSave(input);
    } catch {
      setState("error");
    }
  };

  const numberField = (key: keyof Draft, label: string, hidden = false) =>
    hidden ? null : (
      <div className="field">
        <label htmlFor={`${id}-${key}`}>{label}</label>
        <input
          id={`${id}-${key}`}
          className="input num"
          inputMode="decimal"
          value={d[key] as string}
          onChange={(e) => set(key, e.target.value as never)}
        />
      </div>
    );

  return (
    <form className="stack-l manual-activity" onSubmit={submit} noValidate>
      <div className="form-grid">
        <div className="field full">
          <label htmlFor={`${id}-sport`}>{t("plan.field.activityType")}</label>
          <select
            id={`${id}-sport`}
            className="input"
            value={d.activityType}
            onChange={(e) => set("activityType", e.target.value as ActivityType)}
          >
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {sportLabel(t, s)}
              </option>
            ))}
          </select>
        </div>
        <div className="field full">
          <label htmlFor={`${id}-name`}>{t("manual.name")}</label>
          <input
            id={`${id}-name`}
            className="input"
            maxLength={100}
            placeholder={sportLabel(t, d.activityType)}
            value={d.activityName}
            onChange={(e) => set("activityName", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-date`}>{t("manual.date")}</label>
          <input
            id={`${id}-date`}
            className="input"
            type="date"
            max={today}
            value={d.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-start`}>{t("manual.start")}</label>
          <input
            id={`${id}-start`}
            className="input"
            type="time"
            value={d.startTime}
            onChange={(e) => set("startTime", e.target.value)}
          />
        </div>
        <fieldset className="field full duration-field">
          <legend className="label">{t("manual.duration")}</legend>
          <div className="duration-inputs">
            {(["hours", "minutes", "seconds"] as const).map((key) => (
              <label key={key} className="duration-part">
                <input
                  className="input num"
                  inputMode="numeric"
                  aria-label={t(`manual.${key}`)}
                  value={d[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
                <span className="small muted" aria-hidden>
                  {t(`manual.${key}.short`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {numberField("distance", t("manual.distance", { unit: f.distanceUnit }), !hasDistance)}
        {numberField(
          "elevation",
          t("manual.elevation", { unit: imperial ? "ft" : "m" }),
          !hasDistance,
        )}
        {numberField("avgHr", t("activity.avgHr"))}
        {numberField("maxHr", t("activity.maxHr"))}
        {numberField("power", t("manual.power"))}
        {numberField("calories", t("manual.calories"))}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="checkin-label">
          <span>{t("checkin.effort")}</span>
          <span className="muted">{t("checkin.effortHint")}</span>
        </div>
        <div className="rpe compact" role="group" aria-label={t("checkin.effort")}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={d.effort === v}
              onClick={() => set("effort", d.effort === v ? null : v)}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="checkin-label">
          <span>{t("checkin.feel")}</span>
        </div>
        <div className="feel compact" role="group" aria-label={t("checkin.feel")}>
          {FEEL_EMOJI.map((emoji, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={d.feel === i + 1}
              onClick={() => set("feel", d.feel === i + 1 ? null : i + 1)}
            >
              <span aria-hidden>{emoji}</span>
              <span>{t(`checkin.feel.${i + 1}` as "checkin.feel.1")}</span>
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor={`${id}-comment`}>{t("manual.comment")}</label>
          <textarea
            id={`${id}-comment`}
            className="input"
            rows={2}
            maxLength={2000}
            value={d.comment}
            onChange={(e) => set("comment", e.target.value)}
          />
        </div>
      </div>

      {problem && (
        <p className="small" role="alert" style={{ color: "var(--bad)" }}>
          {t(`manual.problem.${problem}`)}
        </p>
      )}
      {state === "error" && (
        <p className="small" role="alert" style={{ color: "var(--bad)" }}>
          {t("manual.error")}
        </p>
      )}
      <p className="tiny muted">{t("manual.fileHint")}</p>
      <div className="sheet-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <span className="grow" />
        <button type="submit" className="btn btn-primary" disabled={state === "saving"}>
          {state === "saving" ? t("common.saving") : t("manual.save")}
        </button>
      </div>
    </form>
  );
}
