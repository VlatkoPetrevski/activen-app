import { dayName, weekStart, type DayName } from "./dates.js";
import { classifyHr, profileForDate } from "./hr-zones.js";
import { matchPlanToActivities, type PlanLink } from "./matching.js";
import { isRun } from "./sport.js";
import { emptySummary, summarize, type PaceBasis, type PeriodSummary } from "./summaries.js";
import type {
  Activity,
  HrZone,
  HrZoneProfile,
  LocalDate,
  PlanEntry,
  PlanLinkOverride,
} from "./types.js";

/** Lightest grey used for race rows in the reference report (spec §10). */
export const RACE_ROW_FILL = "#F2F2F2";
/** Light-blue summary style of the reference report (spec §11). */
export const SUMMARY_ROW_FILL = "#DDEBF7";

export interface RowStyle {
  bold: boolean;
  /** Lighter dark-grey font for non-Run activities. */
  muted: boolean;
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
  date: LocalDate;
  day: DayName;
  activity: Activity;
  plan: PlanEntry | null;
  link: PlanLink | null;
  zone: HrZone | null;
  style: RowStyle;
}

export type PlanOnlyStatus = "rest" | "upcoming" | "missed" | "unlinked";

export interface PlanOnlyRow {
  type: "plan_only";
  date: LocalDate;
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
}

const NO_STYLE: RowStyle = { bold: false, muted: false, rowFill: null, zoneFill: null };

/**
 * Builds the calendar-oriented Activities view (spec §5, §11): newest dates first, a weekly summary
 * row above each Monday–Sunday block, actual activities with their linked plan text, and plan-only
 * rows for rest days, future plans and plans with no matching activity.
 */
export function buildActivitiesReport(input: ActivitiesReportInput): ActivitiesReport {
  const activities = input.activities.filter((a) => !a.deleted);
  const links = matchPlanToActivities(input.planEntries, activities, input.overrides ?? []);
  const planById = new Map(input.planEntries.map((p) => [p.id, p]));
  const linkByActivity = new Map<string, PlanLink>();
  for (const l of links) if (l.activityId) linkByActivity.set(l.activityId, l);

  const summaryOptions = {
    hrProfiles: input.hrProfiles,
    ...(input.paceBasis ? { paceBasis: input.paceBasis } : {}),
  };
  const weekSummaries = new Map(
    summarize(activities, "week", summaryOptions).map((s) => [s.key, s]),
  );

  type DayItem = { date: LocalDate; sortKey: string; row: ActivityRow | PlanOnlyRow };
  const items: DayItem[] = [];

  for (const activity of activities) {
    const link = linkByActivity.get(activity.id) ?? null;
    const profile = profileForDate(input.hrProfiles, activity.localDate);
    const zone = profile ? classifyHr(activity.avgHr, profile.zones) : null;
    items.push({
      date: activity.localDate,
      sortKey: `1|${activity.startTime}`,
      row: {
        type: "activity",
        date: activity.localDate,
        day: dayName(activity.localDate),
        activity,
        plan: link ? (planById.get(link.planEntryId) ?? null) : null,
        link,
        zone,
        style: {
          bold: activity.isRace,
          muted: !isRun(activity.sportType),
          rowFill: activity.isRace ? RACE_ROW_FILL : null,
          zoneFill: zone?.color ?? null,
        },
      },
    });
  }

  for (const link of links) {
    if (link.activityId) continue;
    const plan = planById.get(link.planEntryId);
    if (!plan) continue;
    const status: PlanOnlyStatus =
      plan.kind === "rest"
        ? "rest"
        : link.reason === "manual_unlinked"
          ? "unlinked"
          : plan.date >= input.today
            ? "upcoming"
            : "missed";
    items.push({
      date: plan.date,
      sortKey: `0|${(999_999 - plan.sequence).toString().padStart(6, "0")}`,
      row: {
        type: "plan_only",
        date: plan.date,
        day: dayName(plan.date),
        plan,
        link,
        status,
        style: NO_STYLE,
      },
    });
  }

  // Newest date first; within a day, latest activity first and plan-only rows last.
  items.sort((a, b) => b.date.localeCompare(a.date) || b.sortKey.localeCompare(a.sortKey));

  const rows: ReportRow[] = [];
  let currentWeek: string | null = null;
  for (const item of items) {
    const wk = weekStart(item.date);
    if (wk !== currentWeek) {
      currentWeek = wk;
      rows.push({
        type: "week_summary",
        summary: weekSummaries.get(wk) ?? emptySummary(wk, "week", true),
        style: { ...NO_STYLE, bold: true, rowFill: SUMMARY_ROW_FILL },
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
