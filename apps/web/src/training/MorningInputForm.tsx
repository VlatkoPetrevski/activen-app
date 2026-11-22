import { SLEEP_RANGES, sleepRangeIndex, type MorningInputDto } from "@activen/contracts";
import { sleepQualityKey, sleepRangeText } from "@activen/i18n";
import { useId, useState, type FormEvent } from "react";
import { useI18n } from "../i18n/I18nContext.js";

/** Same faces as the post-session check-in, from a very poor to an excellent night. */
const SLEEP_EMOJI = ["😫", "😕", "🙂", "😊", "🤩"] as const;

/**
 * The morning input: roughly how long the athlete slept (a range), how the night was (1–5, the
 * check-in faces) and the resting pulse. Every part is optional; one is enough.
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
  const { t, translator } = useI18n();
  const id = useId();
  const [range, setRange] = useState<number | null>(
    sleepRangeIndex(initial?.sleepDurationInSeconds ?? null),
  );
  const [quality, setQuality] = useState<number | null>(initial?.sleepQuality ?? null);
  const [pulse, setPulse] = useState(
    initial?.restingHeartRate == null ? "" : String(initial.restingHeartRate),
  );
  const [state, setState] = useState<"idle" | "saving" | "invalid" | "error">("idle");

  const parse = (): MorningInputDto | null => {
    const p = pulse.trim() === "" ? null : Number(pulse);
    if (p !== null && (!Number.isInteger(p) || p < 25 || p > 120)) return null;
    const seconds = range === null ? null : (SLEEP_RANGES[range]?.seconds ?? null);
    if (seconds === null && quality === null && p === null) return null;
    return { sleepDurationInSeconds: seconds, sleepQuality: quality, restingHeartRate: p };
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
      <div className="checkin-label">
        <span>{t("briefing.morning.sleep")}</span>
      </div>
      <div className="sleep-ranges" role="group" aria-label={t("briefing.morning.sleep")}>
        {SLEEP_RANGES.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={range === i}
            onClick={() => {
              setRange(range === i ? null : i);
              setState("idle");
            }}
          >
            {sleepRangeText(translator, i)}
          </button>
        ))}
      </div>
      <div className="checkin-label">
        <span>{t("briefing.morning.quality")}</span>
      </div>
      <div className="feel compact" role="group" aria-label={t("briefing.morning.quality")}>
        {SLEEP_EMOJI.map((emoji, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={quality === i + 1}
            onClick={() => {
              setQuality(quality === i + 1 ? null : i + 1);
              setState("idle");
            }}
          >
            <span aria-hidden>{emoji}</span>
            <span>{t(sleepQualityKey(i + 1))}</span>
          </button>
        ))}
      </div>
      <div className="field morning-pulse">
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
