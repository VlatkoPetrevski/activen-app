import { sportCategory, type SportCategory } from "./sport.js";
import type { Activity, PlanEntry, PlanLinkOverride } from "./types.js";

export type PlanLinkReason =
  /** Exactly one candidate activity on the date (spec §7 rule 2). */
  | "auto_single"
  /** Several candidates; the longest by distance was chosen (rule 3). */
  | "auto_longest"
  /** The user picked the activity (rule 5). */
  | "manual"
  /** The user explicitly detached the plan from any activity. */
  | "manual_unlinked"
  /** Rest days never link to an activity (PLAN-04). */
  | "rest_day"
  /** No candidate activity exists (yet) — the plan is shown as a plan-only row. */
  | "no_candidate";

export type PlanLinkWarning =
  /** The overridden activity no longer exists or was deleted; automatic matching was used instead. */
  | "OVERRIDE_TARGET_MISSING"
  /** The overridden activity is already linked to another plan; automatic matching was used instead. */
  | "OVERRIDE_TARGET_TAKEN"
  /** Overrides on rest days are ignored. */
  | "OVERRIDE_ON_REST_DAY";

export interface PlanLink {
  planEntryId: string;
  activityId: string | null;
  reason: PlanLinkReason;
  warning: PlanLinkWarning | null;
}

/**
 * Which activities a plan entry may automatically attach to. The spec's rule is "Run"; when a plan
 * explicitly targets another sport (e.g. a planned Ride), activities of that sport category are used
 * instead so that multi-sport plans behave the same way.
 */
function targetCategory(entry: PlanEntry): SportCategory {
  return entry.plannedSportType ? sportCategory(entry.plannedSportType) : "run";
}

/** Longest distance first; ties resolved by earlier start, then id, so the result is deterministic. */
function compareCandidates(a: Activity, b: Activity): number {
  return (
    (b.distanceM ?? 0) - (a.distanceM ?? 0) ||
    a.startTime.localeCompare(b.startTime) ||
    a.id.localeCompare(b.id)
  );
}

function compareEntries(a: PlanEntry, b: PlanEntry): number {
  return a.date.localeCompare(b.date) || a.sequence - b.sequence || a.id.localeCompare(b.id);
}

/**
 * Applies the plan-to-activity matching rules (spec §7). Pure function: plan entries and activities
 * are never modified; the result is the relation between them.
 *
 * 1. Candidates are activities on the same athlete-local date.
 * 2. Exactly one Run → linked.  3. Several Runs → the longest one.
 * 4. Non-Run activities are never auto-linked, so their own data is untouched.
 * 5. Manual overrides win (and may point to an activity on another date, e.g. a shifted workout).
 *
 * Each activity receives at most one plan entry. When several sessions are planned on one date they
 * are processed by `sequence`, each taking the longest remaining candidate.
 */
export function matchPlanToActivities(
  entries: readonly PlanEntry[],
  activities: readonly Activity[],
  overrides: readonly PlanLinkOverride[] = [],
): PlanLink[] {
  const live = activities.filter((a) => !a.deleted);
  const liveById = new Map(live.map((a) => [a.id, a]));
  const byDate = new Map<string, Activity[]>();
  for (const a of live) {
    const list = byDate.get(a.localDate);
    if (list) list.push(a);
    else byDate.set(a.localDate, [a]);
  }
  const overrideByEntry = new Map(overrides.map((o) => [o.planEntryId, o]));

  const claimed = new Set<string>();
  const result = new Map<string, PlanLink>();
  const sorted = [...entries].sort(compareEntries);

  // Pass 1: rest days and manual decisions, so automatic matching never steals a chosen activity.
  for (const entry of sorted) {
    const override = overrideByEntry.get(entry.id);
    if (entry.kind === "rest") {
      result.set(entry.id, {
        planEntryId: entry.id,
        activityId: null,
        reason: "rest_day",
        warning: override ? "OVERRIDE_ON_REST_DAY" : null,
      });
      continue;
    }
    if (!override) continue;
    if (override.activityId === null) {
      result.set(entry.id, {
        planEntryId: entry.id,
        activityId: null,
        reason: "manual_unlinked",
        warning: null,
      });
      continue;
    }
    if (liveById.has(override.activityId) && !claimed.has(override.activityId)) {
      claimed.add(override.activityId);
      result.set(entry.id, {
        planEntryId: entry.id,
        activityId: override.activityId,
        reason: "manual",
        warning: null,
      });
    }
    // Otherwise fall through to automatic matching in pass 2 with a warning.
  }

  // Pass 2: automatic matching.
  for (const entry of sorted) {
    if (result.has(entry.id)) continue;
    const override = overrideByEntry.get(entry.id);
    const warning: PlanLinkWarning | null = override?.activityId
      ? liveById.has(override.activityId)
        ? "OVERRIDE_TARGET_TAKEN"
        : "OVERRIDE_TARGET_MISSING"
      : null;

    const category = targetCategory(entry);
    const candidates = (byDate.get(entry.date) ?? [])
      .filter((a) => !claimed.has(a.id) && sportCategory(a.sportType) === category)
      .sort(compareCandidates);
    const chosen = candidates[0];

    if (!chosen) {
      result.set(entry.id, {
        planEntryId: entry.id,
        activityId: null,
        reason: "no_candidate",
        warning,
      });
      continue;
    }
    claimed.add(chosen.id);
    result.set(entry.id, {
      planEntryId: entry.id,
      activityId: chosen.id,
      reason: candidates.length === 1 ? "auto_single" : "auto_longest",
      warning,
    });
  }

  return entries.map((e) => result.get(e.id) as PlanLink);
}
