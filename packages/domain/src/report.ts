import { dayName, weekStart, type DayName } from "./dates.js";
import { classifyHr, profileForDate } from "./hr-zones.js";
import { matchPlanToActivities, type PlanLink } from "./matching.js";
import { filterActivities, isRunning, type ActivityFilter } from "./sport.js";
import { emptySummary, summarize, type PaceBasis, type PeriodSummary } from "./summaries.js";
import type {
  Activity,
  HrZone,
  HrZoneProfile,
  LocalDate,
  PlanEntry,
  PlanLinkOverride,
  Vendor,
} from "./types.js";

/** Report palette, taken from the reference workbook (`Strava_Activities_VP_v26.xlsx`). */
export const REPORT_COLORS = Object.freeze({
  headerFill: "#1F4E78",
  headerFont: "#FFFFFF",
  /** Light-blue summary rows (spec §11). */
  summaryFill: "#DDE4EB",
  summaryFont: "#666666",
  /** Lighter dark-grey font for non-Run activities (spec §10). */
  nonRunFont: "#666666",
  /** Rest and plan-only rows. */
  planOnlyFont: "#777777",
  /** Lightest grey for race rows (spec §10; not yet used in the workbook). */
  raceFill: "#F2F2F2",
});

export interface RowStyle {
  bold: boolean;
  /** Lighter dark-grey font for non-Run activities. */
  muted: boolean;
  /** Font color; `null` = default text color. */
  fontColor: string | null;
  rowFill: string | null;
  /** Fill of the HR Zone cell; never set for rest or plan-only rows. */
  zoneFill: string | null;
}

export interface WeekSummaryRow {
  type: "week_summary";
  summary: PeriodSummary;
  style: RowStyle;
}

export interface ActivityRow {
  type: "activity";
  calendarDate: LocalDate;
  day: DayName;
  activity: Activity;
  plan: PlanEntry | null;
  link: PlanLink | null;
  zone: HrZone | null;
  style: RowStyle;
}

/**
 * `completed_hidden`: the plan was executed, but the linked activity is hidden by the active filter.
 */
export type PlanOnlyStatus = "rest" | "upcoming" | "missed" | "unlinked" | "completed_hidden";

export interface PlanOnlyRow {
  type: "plan_only";
  calendarDate: LocalDate;
  day: DayName;
  plan: PlanEntry;
  link: PlanLink;
  status: PlanOnlyStatus;
  style: RowStyle;
}

export type ReportRow = WeekSummaryRow | ActivityRow | PlanOnlyRow;

export interface ActivitiesReport {
  rows: ReportRow[];
  yearSummaries: PeriodSummary[];
  links: PlanLink[];
}

export interface ActivitiesReportInput {
  activities: readonly Activity[];
  planEntries: readonly PlanEntry[];
  overrides?: readonly PlanLinkOverride[];
  hrProfiles: readonly HrZoneProfile[];
  /** Athlete-local "today", used to tell upcoming plans from missed ones. */
  today: LocalDate;
  paceBasis?: PaceBasis;
  /** Preferred HR-zone sources, see `profileForDate`. */
  zoneSourcePreference?: readonly Vendor[];
  /**
   * Which activities are shown and counted (e.g. running only). Plan-only rows stay visible so
   * that the plan is never hidden by a filter; matching still sees all activities.
   */
  filter?: ActivityFilter;
}

const PLAN_ONLY_STYLE: RowStyle = {
  bold: false,
  muted: true,
  fontColor: REPORT_COLORS.planOnlyFont,
  rowFill: null,
  zoneFill: null,
};

/**
 * Builds the calendar-oriented Activities view (spec §5, §11): newest dates first, a weekly summary
 * row above each Monday–Sunday block, actual activities with their linked plan text, and plan-only
 * rows for rest days, future plans and plans with no matching activity.
 */
export function buildActivitiesReport(input: ActivitiesReportInput): ActivitiesReport {
  const allActivities = input.activities.filter((a) => !a.deleted);
  // Matching uses every activity, so a filter never changes which activity a plan belongs to.
  const links = matchPlanToActivities(input.planEntries, allActivities, input.overrides ?? []);
  const activities = filterActivities(allActivities, input.filter);
  const visibleIds = new Set(activities.map((a) => a.id));
  const planById = new Map(input.planEntries.map((p) => [p.id, p]));
  const linkByActivity = new Map<string, PlanLink>();
  for (const l of links) if (l.activityId) linkByActivity.set(l.activityId, l);

  const summaryOptions = {
    hrProfiles: input.hrProfiles,
    ...(input.paceBasis ? { paceBasis: input.paceBasis } : {}),
    ...(input.zoneSourcePreference ? { zoneSourcePreference: input.zoneSourcePreference } : {}),
  };
  const weekSummaries = new Map(
    summarize(activities, "week", summaryOptions).map((s) => [s.key, s]),
  );

  type DayItem = { calendarDate: LocalDate; sortKey: string; row: ActivityRow | PlanOnlyRow };
  const items: DayItem[] = [];

  for (const activity of activities) {
    const link = linkByActivity.get(activity.id) ?? null;
    const profile = profileForDate(
      input.hrProfiles,
      activity.calendarDate,
      input.zoneSourcePreference,
    );
    const zone = profile
      ? classifyHr(activity.averageHeartRateInBeatsPerMinute, profile.zones)
      : null;
    items.push({
      calendarDate: activity.calendarDate,
      sortKey: `1|${activity.startTimeInSeconds.toString().padStart(12, "0")}`,
      row: {
        type: "activity",
        calendarDate: activity.calendarDate,
        day: dayName(activity.calendarDate),
        activity,
        plan: link ? (planById.get(link.planEntryId) ?? null) : null,
        link,
        zone,
        style: {
          bold: activity.isRace,
          muted: !isRunning(activity.activityType),
          fontColor: isRunning(activity.activityType) ? null : REPORT_COLORS.nonRunFont,
          rowFill: activity.isRace ? REPORT_COLORS.raceFill : null,
          zoneFill: zone?.color ?? null,
        },
      },
    });
  }

  for (const link of links) {
    if (link.activityId && visibleIds.has(link.activityId)) continue;
    const plan = planById.get(link.planEntryId);
    if (!plan) continue;
    const status: PlanOnlyStatus = link.activityId
      ? "completed_hidden"
      : plan.kind === "rest"
        ? "rest"
        : link.reason === "manual_unlinked"
          ? "unlinked"
          : plan.calendarDate >= input.today
            ? "upcoming"
            : "missed";
    items.push({
      calendarDate: plan.calendarDate,
      sortKey: `0|${(999_999 - plan.sequence).toString().padStart(6, "0")}`,
      row: {
        type: "plan_only",
        calendarDate: plan.calendarDate,
        day: dayName(plan.calendarDate),
        plan,
        link,
        status,
        style: PLAN_ONLY_STYLE,
      },
    });
  }

  // Newest date first; within a day, latest activity first and plan-only rows last.
  items.sort(
    (a, b) => b.calendarDate.localeCompare(a.calendarDate) || b.sortKey.localeCompare(a.sortKey),
  );

  const rows: ReportRow[] = [];
  let currentWeek: string | null = null;
  for (const item of items) {
    const wk = weekStart(item.calendarDate);
    if (wk !== currentWeek) {
      currentWeek = wk;
      rows.push({
        type: "week_summary",
        summary: weekSummaries.get(wk) ?? emptySummary(wk, "week", true),
        style: {
          bold: true,
          muted: false,
          fontColor: REPORT_COLORS.summaryFont,
          rowFill: REPORT_COLORS.summaryFill,
          zoneFill: null,
        },
      });
    }
    rows.push(item.row);
  }

  return {
    rows,
    yearSummaries: summarize(activities, "year", summaryOptions),
    links,
  };
}
