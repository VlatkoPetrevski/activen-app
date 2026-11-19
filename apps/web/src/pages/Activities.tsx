import type { ActivityDto } from "@activen/contracts";
import { addDays, type ActivityGroup } from "@activen/domain";
import type { MessageKey } from "@activen/i18n";
import { useQuery } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { useApi } from "../api/ApiContext.js";
import { useMe } from "../auth/AuthContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import {
  activeFilterCount,
  applyActivityFilter,
  DEFAULT_FILTER,
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
import { insightText } from "../training/Insights.js";
import { activitySummary, paceOrSpeed } from "../training/labels.js";
import { RouteMap } from "../training/RouteMap.js";
import { Dialog } from "../ui/Dialog.js";
import { Icon, SportIcon } from "../ui/Icon.js";
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
const DISTANCES: DistanceBand[] = ["any", "lt5", "5to10", "10to21", "21plus"];
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

/** Expanded row: a small route map, one line of summary, key numbers and the actions. */
function ActivityPreview({ activity }: { activity: ActivityDto }) {
  const api = useApi();
  const { t, f } = useI18n();
  const detail = useQuery({
    queryKey: ["me", "activity", activity.id],
    queryFn: () => api.activity(activity.id),
  });
  const ps = paceOrSpeed(f, activity);
  const facts: [string, string | null][] = [
    [ps?.kind === "speed" ? t("activity.speed") : t("activity.pace"), ps?.text ?? null],
    [
      t("activity.avgHr"),
      activity.averageHeartRateInBeatsPerMinute
        ? String(Math.round(activity.averageHeartRateInBeatsPerMinute))
        : null,
    ],
    [
      t("activity.elevation"),
      activity.totalElevationGainInMeters ? f.elevation(activity.totalElevationGainInMeters) : null,
    ],
    [t("activity.load"), activity.trainingLoad ? f.number(activity.trainingLoad, 0) : null],
  ];
  const first = detail.data?.insights[0];
  return (
    <div className="preview">
      {detail.data?.route && (
        <RouteMap
          route={detail.data.route}
          tiles={api.mode === "http"}
          distanceInMeters={activity.distanceInMeters}
          height={210}
        />
      )}
      {first && <p className="preview-insight small">✦ {insightText(t, first)}</p>}
      <div className="preview-facts">
        {facts
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <div key={label}>
              <span className="num">{value}</span>
              <span className="tiny muted">{label}</span>
            </div>
          ))}
      </div>
      <div className="preview-actions">
        {!activity.feedback && (
          <Link className="btn btn-primary btn-small" to={`/activities/${activity.id}`}>
            {t("activities.rate")}
          </Link>
        )}
        <Link className="btn btn-secondary btn-small" to={`/activities/${activity.id}`}>
          {t("activities.open")} <Icon name="chevronRight" size={16} />
        </Link>
      </div>
    </div>
  );
}

function ActivityRow({
  activity: a,
  open,
  onToggle,
  dayLabel,
}: {
  activity: ActivityDto;
  open: boolean;
  onToggle(): void;
  dayLabel: string;
}) {
  const { t, f } = useI18n();
  const id = useId();
  return (
    <div className={`activity-row${open ? " open" : ""}`}>
      <button
        type="button"
        className="list-item activity-head"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        <SportIcon group={groupOf(a.activityType)} />
        <span className="grow">
          <span className="row-between">
            <strong className="activity-name">{a.activityName ?? ""}</strong>
            {a.feedback?.perceivedEffort ? (
              <span className="chip">RPE {a.feedback.perceivedEffort}</span>
            ) : (
              <span className="chip warn">{t("activities.noCheckIn")}</span>
            )}
          </span>
          <span className="small muted">
            {dayLabel} · {activitySummary(f, a)}
          </span>
        </span>
        <span className="segment-chevron" aria-hidden>
          <Icon name="chevronDown" size={18} />
        </span>
      </button>
      {open && (
        <div id={id} role="region" aria-label={a.activityName ?? ""}>
          <ActivityPreview activity={a} />
        </div>
      )}
    </div>
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
  const [openId, setOpenId] = useState<string | null>(null);
  const from = addDays(today, -filter.period + 1);
  const query = useQuery({
    queryKey: ["me", "activities", from, today],
    queryFn: () => api.activities(from, today),
    placeholderData: (prev) => prev,
  });
  const set = (patch: Partial<ActivityListFilter>) => setFilter((x) => ({ ...x, ...patch }));
  const shown = useMemo(() => applyActivityFilter(query.data ?? [], filter), [query.data, filter]);
  const draftCount = useMemo(
    () => applyActivityFilter(query.data ?? [], draft).length,
    [query.data, draft],
  );
  const sum = totals(shown);
  const extra = activeFilterCount({ ...filter, group: "all", run: "all", query: "" });

  const dayLabel = (a: ActivityDto) => {
    const rel = relativeDay(a.calendarDate, today);
    return rel ? t(`common.${rel}`) : f.date(a.calendarDate, "long");
  };

  return (
    <div className="stack-l">
      <div className="stack" style={{ gap: 4 }}>
        <h1>{t("nav.activities")}</h1>
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
              <div className="list">
                {shown.map((a) => (
                  <ActivityRow
                    key={a.id}
                    activity={a}
                    dayLabel={dayLabel(a)}
                    open={openId === a.id}
                    onToggle={() => setOpenId((x) => (x === a.id ? null : a.id))}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </QueryView>

      <Dialog open={sheet} title={t("activities.filters")} onClose={() => setSheet(false)}>
        <div className="stack-l">
          <div className="field">
            <span className="label">{t("activities.distance")}</span>
            <Chips
              label={t("activities.distance")}
              values={DISTANCES}
              value={draft.distance}
              text={(v) => t(`activities.distance.${v}`)}
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
