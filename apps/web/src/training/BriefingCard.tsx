import type { BriefingDto, MorningInputDto } from "@activen/contracts";
import type { BriefingVerdict } from "@activen/domain";
import { briefingText } from "@activen/i18n";
import { useState } from "react";
import { useI18n } from "../i18n/I18nContext.js";
import { Icon } from "../ui/Icon.js";
import { MorningInputForm } from "./MorningInputForm.js";
import { readinessColor } from "./ReadinessSegment.js";

const VERDICT_TONE: Record<BriefingVerdict, "good" | "teal" | "warn" | "bad"> = {
  as_planned: "good",
  ease_off: "teal",
  swap_easy: "warn",
  rest: "bad",
};

/**
 * The morning advice above today's session: verdict, readiness, one-sentence reason and the
 * concrete change. Without a watch night the athlete can enter or correct sleep here.
 */
/** True when a device recorded last night; entered sleep is then neither offered nor needed. */
export const hasDeviceNight = (briefing: BriefingDto): boolean => {
  const day = briefing.today;
  return (
    !!day &&
    ((day.sleepScore != null && day.sources.sleepScore !== "manual") ||
      (day.sleepDurationInSeconds != null && day.sources.sleepDurationInSeconds !== "manual"))
  );
};

export function BriefingCard({
  briefing,
  onSaveMorning,
  title,
  editing: editingProp,
  onEditingChange,
}: {
  briefing: BriefingDto;
  /** The athlete's own card; absent for the coach (read-only). */
  onSaveMorning?: (input: MorningInputDto | null) => Promise<unknown>;
  title?: string;
  /** Controlled editing state, so the sleep tile's edit button can open the form here. */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
}) {
  const { t, f, translator } = useI18n();
  const { readiness, advice } = briefing;
  const noData = readiness.score === null;
  const [editingState, setEditingState] = useState(false);
  const editing = editingProp ?? editingState;
  const setEditing = (next: boolean) => {
    setEditingState(next);
    onEditingChange?.(next);
  };
  const text = briefingText(translator, f, readiness, advice);
  const tone = noData ? "teal" : VERDICT_TONE[advice.verdict];
  // Entering sleep is only for a morning the watch did not record (or to change what was entered).
  const canEnter = !!onSaveMorning && !hasDeviceNight(briefing);
  const showForm = canEnter && (noData || editing);

  return (
    <section className={`card stack briefing tone-${tone}`} aria-label={t("briefing.title")}>
      <div className="row-between wrap">
        <span className="eyebrow">{title ?? t("briefing.title")}</span>
        {readiness.score !== null && readiness.level && (
          <span className="chip num" style={{ color: readinessColor(readiness.score) }}>
            {t("briefing.readiness", {
              score: readiness.score,
              level: t(`trainingReadiness.level.${readiness.level}`).toLowerCase(),
            })}
          </span>
        )}
      </div>
      {noData ? (
        <p className="muted">{text.reason}</p>
      ) : (
        <>
          <h2 className="briefing-verdict">{text.verdict}</h2>
          <p>{text.reason}</p>
          {text.change && (
            <p className="briefing-change row">
              <Icon name="swap" size={16} />
              <strong>{text.change}</strong>
            </p>
          )}
          <p className="tiny muted">{t(`briefing.confidence.${readiness.confidence}`)}</p>
        </>
      )}
      {showForm ? (
        <MorningInputForm
          onCancel={editing && !noData ? () => setEditing(false) : undefined}
          initial={briefing.morningInput}
          onSave={async (input) => {
            await onSaveMorning(input);
            setEditing(false);
          }}
          {...(briefing.morningInput
            ? {
                onClear: async () => {
                  await onSaveMorning(null);
                  setEditing(false);
                },
              }
            : {})}
        />
      ) : (
        canEnter && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            style={{ alignSelf: "flex-start" }}
            onClick={() => setEditing(true)}
          >
            <Icon name="edit" size={16} />{" "}
            {t(briefing.morningInput ? "briefing.morning.change" : "briefing.morning.enter")}
          </button>
        )
      )}
    </section>
  );
}
