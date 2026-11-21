import type { MorningInputDto } from "@activen/contracts";
import { useId, useState, type FormEvent } from "react";
import { useI18n } from "../i18n/I18nContext.js";

const MAX_SLEEP_HOURS = 16;

/**
 * The morning input: measured values only — hours and minutes slept and the resting pulse.
 * No self-assessment scales (product decision, ADR-0013).
 */
export function MorningInputForm({
  initial,
  onSave,
  onClear,
}: {
  initial: MorningInputDto | null;
  onSave(input: MorningInputDto): Promise<unknown>;
  /** Shown when something was entered before. */
  onClear?: () => Promise<unknown>;
}) {
  const { t } = useI18n();
  const id = useId();
  const sleep = initial?.sleepDurationInSeconds ?? null;
  const [hours, setHours] = useState(sleep === null ? "" : String(Math.floor(sleep / 3600)));
  const [minutes, setMinutes] = useState(
    sleep === null ? "" : String(Math.round((sleep % 3600) / 60)),
  );
  const [pulse, setPulse] = useState(
    initial?.restingHeartRate == null ? "" : String(initial.restingHeartRate),
  );
  const [state, setState] = useState<"idle" | "saving" | "invalid" | "error">("idle");

  const parse = (): MorningInputDto | null => {
    const h = hours.trim() === "" ? null : Number(hours);
    const m = minutes.trim() === "" ? 0 : Number(minutes);
    const p = pulse.trim() === "" ? null : Number(pulse);
    if (h !== null && (!Number.isInteger(h) || h < 0 || h > MAX_SLEEP_HOURS)) return null;
    if (!Number.isInteger(m) || m < 0 || m > 59) return null;
    if (p !== null && (!Number.isInteger(p) || p < 25 || p > 120)) return null;
    const seconds = h === null ? null : h * 3600 + m * 60;
    if (seconds !== null && seconds > MAX_SLEEP_HOURS * 3600) return null;
    if (seconds === null && p === null) return null;
    return { sleepDurationInSeconds: seconds, restingHeartRate: p };
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const input = parse();
    if (!input) return setState("invalid");
    setState("saving");
    try {
      await onSave(input);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  return (
    <form
      className="stack morning-input"
      onSubmit={submit}
      aria-labelledby={`${id}-title`}
      noValidate
    >
      <div className="stack" style={{ gap: 2 }}>
        <h3 id={`${id}-title`}>{t("briefing.morning.title")}</h3>
        <p className="small muted">{t("briefing.morning.hint")}</p>
      </div>
      <div className="morning-fields">
        <fieldset className="field">
          <legend className="label">{t("briefing.morning.sleep")}</legend>
          <div className="row">
            <input
              id={`${id}-h`}
              className="input num"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_SLEEP_HOURS}
              value={hours}
              aria-label={`${t("briefing.morning.sleep")}, ${t("briefing.morning.hours")}`}
              onChange={(e) => setHours(e.target.value)}
            />
            <span className="small muted">{t("briefing.morning.hours")}</span>
            <input
              id={`${id}-m`}
              className="input num"
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              step={5}
              value={minutes}
              aria-label={`${t("briefing.morning.sleep")}, ${t("briefing.morning.minutes")}`}
              onChange={(e) => setMinutes(e.target.value)}
            />
            <span className="small muted">{t("briefing.morning.minutes")}</span>
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor={`${id}-p`}>{t("briefing.morning.pulse")}</label>
          <input
            id={`${id}-p`}
            className="input num"
            type="number"
            inputMode="numeric"
            min={25}
            max={120}
            value={pulse}
            onChange={(e) => setPulse(e.target.value)}
          />
        </div>
      </div>
      {state === "invalid" && (
        <p className="small" role="alert" style={{ color: "var(--bad)" }}>
          {t("briefing.morning.invalid")}
        </p>
      )}
      {state === "error" && (
        <p className="small" role="alert" style={{ color: "var(--bad)" }}>
          {t("briefing.morning.error")}
        </p>
      )}
      <div className="row wrap">
        <button type="submit" className="btn btn-primary btn-small" disabled={state === "saving"}>
          {t("briefing.morning.save")}
        </button>
        {onClear && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            disabled={state === "saving"}
            onClick={() => {
              setState("saving");
              void onClear().then(
                () => setState("idle"),
                () => setState("error"),
              );
            }}
          >
            {t("briefing.morning.clear")}
          </button>
        )}
      </div>
    </form>
  );
}
