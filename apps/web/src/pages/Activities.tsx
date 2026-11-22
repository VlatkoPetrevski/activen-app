import type { ActivityDto } from "@activen/contracts";
import { addDays, type ActivityGroup } from "@activen/domain";
import type { MessageKey } from "@activen/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useApi } from "../api/ApiContext.js";
import { useMe } from "../auth/AuthContext.js";
import { useI18n, type T } from "../i18n/I18nContext.js";
import type { Formatter } from "@activen/i18n";
import {
  activeFilterCount,
  applyActivityFilter,
  DEFAULT_FILTER,
  DISTANCE_EDGES,
  PERIODS,
  totals,
  type ActivityListFilter,
  type CheckInState,
  type DistanceBand,
  type DurationBand,
  type RunKind,
  type SortKey,
} from "../lib/activityFilters.js";
import { relativeDay, todayIn } from "../lib/dates.js";
import { groupOf } from "../lib/plan.js";
import { activitySummary, paceOrSpeed } from "../training/labels.js";
import {
  ImportButton,
  ImportReport,
  useActivityImport,
  useFileDrop,
} from "../training/ImportFiles.js";
import { ManualActivityForm } from "../training/ManualActivityForm.js";
import { Dialog } from "../ui/Dialog.js";
import { Icon, SportIcon } from "../ui/Icon.js";
import { Pager } from "../ui/Pager.js";
import { Empty, QueryView } from "../ui/States.js";

const GROUPS: (ActivityGroup | "all")[] = [
  "all",
  "running",
  "cycling",
  "gym",
  "swimming",
  "walking",
];
const RUNS: RunKind[] = ["all", "road", "trail", "treadmill", "track"];
const SORTS: SortKey[] = ["newest", "longest", "fastest", "hardest", "load"];
const DISTANCES: DistanceBand[] = ["any", "short", "medium", "long", "veryLong"];

/** "до 5 km", "5–10 km", "21+ km" — or "under 3 mi", "3–6 mi", "13+ mi". */
function distanceBandLabel(t: T, f: Formatter, band: DistanceBand): string {
  if (band === "any") return t("activities.distance.any");
  const [a, b, c] = DISTANCE_EDGES[f.unitSystem];
  const unit = f.distanceUnit;
  const n = (v: number) => f.number(v, 0);
  switch (band) {
    case "short":
      return t("activities.distance.short", { to: n(a), unit });
    case "medium":
      return t("activities.distance.medium", { from: n(a), to: n(b), unit });
    case "long":
      return t("activities.distance.long", { from: n(b), to: n(c), unit });
    case "veryLong":
      return t("activities.distance.veryLong", { from: n(c), unit });
  }
}
const DURATIONS: DurationBand[] = ["any", "lt30", "30to60", "60to120", "120plus"];
const CHECKINS: CheckInState[] = ["any", "rated", "unrated", "hard"];

function Chips<T extends string>({
  label,
  values,
  value,
  text,
  onChange,
}: {
  label: string;
  values: readonly T[];
  value: T;
  text(v: T): string;
  onChange(v: T): void;
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          className="chip chip-button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {text(v)}
        </button>
      ))}
    </div>
  );
}

/** Activities per page: a page fits one window, also on a laptop. */
export const PAGE_SIZE = 10;

/**
 * One compact line per activity: on a computer the numbers sit in aligned columns, on a phone
 * they follow the name in one muted line. The whole line opens the activity.
 */
function ActivityLine({
  activity: a,
  dayLabel,
  shortDay,
}: {
  activity: ActivityDto;
  dayLabel: string;
  shortDay: string;
}) {
  const { t, f } = useI18n();
  const ps = paceOrSpeed(f, a);
  const rating = a.feedback?.perceivedEffort ? (
    <span
      className="chip"
      title={a.feedback.source === "device" ? t("checkin.fromWatch") : undefined}
    >
      {a.feedback.source === "device" && <Icon name="watch" size={14} />}
      RPE {a.feedback.perceivedEffort}
    </span>
  ) : (
    <span className="chip warn">{t("activities.noCheckIn")}</span>
  );
  return (
    <li>
      <Link className="activity-line" to={`/activities/${a.id}`}>
        <SportIcon group={groupOf(a.activityType)} />
        <span className="activity-line-main">
          <strong className="activity-name">{a.activityName ?? ""}</strong>
          <span className="small muted activity-line-meta">
            {dayLabel} · {activitySummary(f, a)}
          </span>
        </span>
        <span className="activity-col small muted">{shortDay}</span>
        <span className="activity-col num">
          {a.distanceInMeters ? f.distance(a.distanceInMeters, 1) : ""}
        </span>
        <span className="activity-col num">{f.duration(a.durationInSeconds)}</span>
        <span className="activity-col num small muted">{ps?.text ?? ""}</span>
        <span className="activity-line-rating">{rating}</span>
      </Link>
    </li>
  );
}

export function ActivitiesPage() {
  const api = useApi();
  const me = useMe();
  const { t, f } = useI18n();
  const today = todayIn(me.settings.timeZone);
  const [filter, setFilter] = useState<ActivityListFilter>(DEFAULT_FILTER);
  const [draft, setDraft] = useState<ActivityListFilter>(DEFAULT_FILTER);
  const [sheet, setSheet] = useState(false);
  const [page, setPage] = useState(1);
  const [entering, setEntering] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const importId = useId();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const from = addDays(today, -filter.period + 1);
  const query = useQuery({
    queryKey: ["me", "activities", from, today],
    queryFn: () => api.activities(from, today),
    placeholderData: (prev) => prev,
  });
  const set = (patch: Partial<ActivityListFilter>) => setFilter((x) => ({ ...x, ...patch }));
  const shown = useMemo(
    () => applyActivityFilter(query.data ?? [], filter, f.unitSystem),
    [query.data, filter, f.unitSystem],
  );
  const draftCount = useMemo(
    () => applyActivityFilter(query.data ?? [], draft, f.unitSystem).length,
    [query.data, draft, f.unitSystem],
  );
  const sum = totals(shown);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  // Another filter, period or search starts on the first page again.
  useEffect(() => setPage(1), [filter]);
  const current = Math.min(page, pages);
  const visible = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const extra = activeFilterCount({ ...filter, group: "all", run: "all", query: "" });

  const importer = useActivityImport();
  const drop = useFileDrop((files) => void importer.run(files));
  const busy = importer.state.phase === "working";

  const shortDay = (a: ActivityDto) => {
    const rel = relativeDay(a.calendarDate, today);
    return rel
      ? t(`common.${rel}`)
      : `${f.date(a.calendarDate, "weekdayShort")}, ${f.date(a.calendarDate, "dayMonth")}`;
  };
  const dayLabel = (a: ActivityDto) => {
    const rel = relativeDay(a.calendarDate, today);
    return rel ? t(`common.${rel}`) : f.date(a.calendarDate, "long");
  };

  return (
    <div
      className={`stack-l drop-area activities-page${drop.dragging ? " dragging" : ""}`}
      {...drop.handlers}
    >
      <div className="stack" style={{ gap: 4 }}>
        <div className="row-between wrap">
          <h1>{t("nav.activities")}</h1>
          <div className="row">
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={() => setEntering(true)}
            >
              <Icon name="plus" size={16} /> {t("manual.open")}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              aria-expanded={importOpen || drop.dragging}
              aria-controls={importId}
              onClick={() => setImportOpen((x) => !x)}
            >
              <Icon name="upload" size={16} /> {t("import.button")}
            </button>
          </div>
        </div>
        {query.data && (
          <span className="small muted num" aria-live="polite">
            {t("activities.summary", {
              count: sum.count,
              distance: f.distance(sum.distanceInMeters, 0),
              duration: f.duration(sum.durationInSeconds),
            })}
          </span>
        )}
      </div>

      {(importOpen || drop.dragging) && (
        <section
          id={importId}
          className={`import-panel${drop.dragging ? " active" : ""}`}
          aria-label={t("import.title")}
        >
          <Icon name="upload" size={20} />
          <span className="grow stack" style={{ gap: 2 }}>
            <span className="small">
              {drop.dragging ? t("import.dropActive") : t("import.panel")}
            </span>
            <span className="tiny muted">{t("import.formats")}</span>
          </span>
          <ImportButton
            busy={busy}
            label={t("import.choose")}
            onFiles={(files) => void importer.run(files)}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label={t("import.closePanel")}
            onClick={() => setImportOpen(false)}
          >
            <Icon name="close" size={16} />
          </button>
        </section>
      )}
      <ImportReport state={importer.state} onClose={importer.reset} />

      <div className="stack" style={{ gap: 8 }}>
        <Chips
          label={t("plan.field.activityType")}
          values={GROUPS}
          value={filter.group}
          text={(g) =>
            g === "all" ? t("activities.filter.all") : t(`activityGroup.${g}` as MessageKey)
          }
          onChange={(group) => set({ group, run: "all" })}
        />
        {filter.group === "running" && (
          <Chips
            label={t("activities.run.all")}
            values={RUNS}
            value={filter.run}
            text={(r) => t(`activities.run.${r}`)}
            onChange={(run) => set({ run })}
          />
        )}
        <div className="toolbar">
          <label className="sr-only" htmlFor="act-period">
            {t("activities.periodLabel")}
          </label>
          <select
            id="act-period"
            className="input"
            value={filter.period}
            onChange={(e) => set({ period: Number(e.target.value) })}
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(`activities.period.${p}`)}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="act-sort">
            {t("activities.sortLabel")}
          </label>
          <select
            id="act-sort"
            className="input"
            value={filter.sort}
            onChange={(e) => set({ sort: e.target.value as SortKey })}
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`activities.sort.${s}`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`btn btn-secondary btn-small${extra ? " has-badge" : ""}`}
            onClick={() => {
              setDraft(filter);
              setSheet(true);
            }}
          >
            {t("activities.filters")}
            {extra > 0 && <span className="badge">{extra}</span>}
          </button>
        </div>
        <input
          className="input"
          type="search"
          aria-label={t("activities.search")}
          placeholder={t("activities.search")}
          value={filter.query}
          onChange={(e) => set({ query: e.target.value })}
        />
      </div>

      <QueryView query={query}>
        {() => (
          <section className="card" style={{ padding: 8 }}>
            {shown.length === 0 ? (
              <Empty>{t("activities.empty")}</Empty>
            ) : (
              <>
                <ul className="activity-lines" aria-label={t("nav.activities")}>
                  {visible.map((a) => (
                    <ActivityLine
                      key={a.id}
                      activity={a}
                      dayLabel={dayLabel(a)}
                      shortDay={shortDay(a)}
                    />
                  ))}
                </ul>
                <Pager page={current} pages={pages} onChange={setPage} />
              </>
            )}
          </section>
        )}
      </QueryView>

      <Dialog open={entering} title={t("manual.title")} onClose={() => setEntering(false)}>
        {entering && (
          <ManualActivityForm
            today={today}
            onCancel={() => setEntering(false)}
            onSave={async (input) => {
              const { activityId } = await api.createActivity(input);
              await queryClient.invalidateQueries({ queryKey: ["me"] });
              setEntering(false);
              void navigate(`/activities/${activityId}`);
            }}
          />
        )}
      </Dialog>

      <Dialog open={sheet} title={t("activities.filters")} onClose={() => setSheet(false)}>
        <div className="stack-l">
          <div className="field">
            <span className="label">{t("activities.distance")}</span>
            <Chips
              label={t("activities.distance")}
              values={DISTANCES}
              value={draft.distance}
              text={(v) => distanceBandLabel(t, f, v)}
              onChange={(distance) => setDraft((d) => ({ ...d, distance }))}
            />
          </div>
          <div className="field">
            <span className="label">{t("activities.duration")}</span>
            <Chips
              label={t("activities.duration")}
              values={DURATIONS}
              value={draft.duration}
              text={(v) => t(`activities.duration.${v}`)}
              onChange={(duration) => setDraft((d) => ({ ...d, duration }))}
            />
          </div>
          <div className="field">
            <span className="label">{t("activities.checkIn")}</span>
            <Chips
              label={t("activities.checkIn")}
              values={CHECKINS}
              value={draft.checkIn}
              text={(v) => t(`activities.checkIn.${v}`)}
              onChange={(checkIn) => setDraft((d) => ({ ...d, checkIn }))}
            />
          </div>
          <div className="sheet-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                setDraft((d) => ({ ...d, distance: "any", duration: "any", checkIn: "any" }))
              }
            >
              {t("activities.reset")}
            </button>
            <span className="grow" />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setFilter(draft);
                setSheet(false);
              }}
            >
              {t("activities.show", { count: draftCount })}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
