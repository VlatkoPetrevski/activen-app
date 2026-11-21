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
 * concrete change. The athlete can enter or correct sleep and pulse here.
 */
export function BriefingCard({
  briefing,
  onSaveMorning,
  title,
}: {
  briefing: BriefingDto;
  /** The athlete's own card; absent for the coach (read-only). */
  onSaveMorning?: (input: MorningInputDto | null) => Promise<unknown>;
  title?: string;
}) {
  const { t, f, translator } = useI18n();
  const { readiness, advice } = briefing;
  const noData = readiness.score === null;
  const [editing, setEditing] = useState(false);
  const text = briefingText(translator, f, readiness, advice);
  const tone = noData ? "teal" : VERDICT_TONE[advice.verdict];
  const showForm = onSaveMorning && (noData || editing);

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
        onSaveMorning && (
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
