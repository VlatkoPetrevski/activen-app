import type { ActivityDto, CalendarDto, PlanEntryDto } from "@activen/contracts";
import {
  activityGroup,
  type ActivityGroup,
  type LocalDate,
  type StepDuration,
  type WorkoutStep,
  type WorkoutStructure,
} from "@activen/domain";

export type EntryStatus = "done" | "missed" | "planned" | "rest";

export interface DayEntry {
  entry: PlanEntryDto;
  activity: ActivityDto | null;
  status: EntryStatus;
}

export interface DayView {
  date: LocalDate;
  entries: DayEntry[];
  /** Activities on this day not linked to any plan entry. */
  extras: ActivityDto[];
}

/** Turns a calendar into per-day rows using the server's plan ↔ activity links. */
export function buildDays(calendar: CalendarDto, days: LocalDate[], today: LocalDate): DayView[] {
  const byId = new Map(calendar.activities.map((a) => [a.id, a]));
  const links = new Map(calendar.links.map((l) => [l.planEntryId, l.activityId]));
  const linked = new Set(calendar.links.map((l) => l.activityId).filter(Boolean));
  return days.map((date) => {
    const entries = calendar.entries
      .filter((e) => e.calendarDate === date)
      .map((entry): DayEntry => {
        const id = links.get(entry.id) ?? null;
        const activity = id ? (byId.get(id) ?? null) : null;
        const status: EntryStatus =
          entry.kind === "rest"
            ? "rest"
            : activity
              ? "done"
              : date < today && calendar.activitiesVisible
                ? "missed"
                : "planned";
        return { entry, activity, status };
      });
    const extras = calendar.activities.filter((a) => a.calendarDate === date && !linked.has(a.id));
    return { date, entries, extras };
  });
}

/** Overall mark of a day for the week strip. */
export function dayMark(day: DayView): EntryStatus | "extra" | "empty" {
  const workouts = day.entries.filter((e) => e.status !== "rest");
  if (workouts.some((e) => e.status === "missed")) return "missed";
  if (workouts.length && workouts.every((e) => e.status === "done")) return "done";
  if (workouts.some((e) => e.status === "planned")) return "planned";
  if (day.extras.length) return "extra";
  if (day.entries.length) return "rest";
  return "empty";
}

export function groupOf(type: string | null): ActivityGroup | "rest" {
  if (!type) return "rest";
  try {
    return activityGroup(type as never);
  } catch {
    return "other";
  }
}

export type Intensity = 1 | 2 | 3 | 4 | 5;

/** Block length for the diagram: distance as km, time as ~6 min/km, open as 1. */
function blockWeight(d: StepDuration): number {
  if (d.type === "distance") return Math.max(0.3, d.meters / 1000);
  if (d.type === "time") return Math.max(0.3, d.seconds / 360);
  return 1;
}

/** Zone-like intensity (1–5) of an accepted step. */
function stepIntensity(s: WorkoutStep): Intensity {
  if (s.target.type === "hr_zone") return Math.min(5, Math.max(1, s.target.zone)) as Intensity;
  switch (s.intensity) {
    case "warmup":
    case "cooldown":
      return 2;
    case "recovery":
    case "rest":
      return 1;
    default:
      return s.target.type === "pace" && s.target.low < 270 ? 5 : 4;
  }
}

/** Diagram blocks from an accepted structure (repeats expanded, capped at 12 reps). */
export function structureBlocks(s: WorkoutStructure): { intensity: Intensity; weight: number }[] {
  return s.items.flatMap((item) => {
    if (item.kind === "step")
      return [{ intensity: stepIntensity(item), weight: blockWeight(item.duration) }];
    const n = Math.min(item.count, 12);
    return Array.from({ length: n }, (_, i) =>
      item.steps
        .filter((st) => i < n - 1 || st.intensity !== "recovery")
        .map((st) => ({ intensity: stepIntensity(st), weight: blockWeight(st.duration) })),
    ).flat();
  });
}

/**
 * Session structure for the plan card: the accepted steps when there are any, otherwise a
 * rough reading of the description ("6 × 1000 m" → warm-up, hard reps, cool-down).
 */
export function workoutStructure(
  entry: Pick<PlanEntryDto, "kind" | "description" | "plannedActivityType" | "structure">,
): {
  intensity: Intensity;
  weight: number;
}[] {
  if (entry.kind === "rest") return [];
  if (entry.structure) return structureBlocks(entry.structure);
  const group = groupOf(entry.plannedActivityType);
  if (group !== "running" && group !== "cycling" && group !== "swimming" && group !== "rowing")
    return [];
  const text = entry.description.toLowerCase();
  const reps = /(\d+)\s*[×x]\s*\d/.exec(text);
  if (reps) {
    const n = Math.min(Number(reps[1]), 12);
    const hard: Intensity = /5k|5 k|интервал|interval/.test(text) ? 5 : 4;
    const blocks: { intensity: Intensity; weight: number }[] = [{ intensity: 2, weight: 3 }];
    for (let i = 0; i < n; i++) {
      blocks.push({ intensity: hard, weight: 1.4 });
      if (i < n - 1) blocks.push({ intensity: 1, weight: 0.7 });
    }
    blocks.push({ intensity: 2, weight: 2.5 });
    return blocks;
  }
  if (/фартлек|fartlek/.test(text))
    return Array.from({ length: 12 }, (_, i) => ({
      intensity: (i % 2 ? 2 : 4) as Intensity,
      weight: 1,
    }));
  if (/долго|long/.test(text))
    return [
      { intensity: 2, weight: 7 },
      { intensity: 3, weight: 2 },
    ];
  if (/опоравув|recovery/.test(text)) return [{ intensity: 1, weight: 1 }];
  return [{ intensity: 2, weight: 1 }];
}
