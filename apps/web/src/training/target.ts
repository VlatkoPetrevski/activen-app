import type { ActivityDetailDto, CalendarDto, GoalDto, PlanEntryDto } from "@activen/contracts";
import type { LocalDate } from "@activen/domain";
import type { Api, GoalInput, PlanInput, PlanPatch } from "../api/api.js";

/** Whose plan a screen works on: the signed-in athlete, or an athlete of the signed-in coach. */
export interface PlanTarget {
  key: readonly unknown[];
  calendar(from: LocalDate, to: LocalDate): Promise<CalendarDto>;
  create(input: PlanInput): Promise<PlanEntryDto>;
  update(id: string, patch: PlanPatch): Promise<PlanEntryDto>;
  remove(id: string): Promise<void>;
  /** One activity with laps and source (coaches: within the athlete's consent). */
  activity(id: string): Promise<ActivityDetailDto>;
  /** The athlete's goal (paces for named efforts); both the athlete and the coach write it. */
  goal(): Promise<GoalDto | null>;
  saveGoal(input: GoalInput): Promise<GoalDto>;
  /** The coach writes advice (notes) for each session. */
  canEditNotes: boolean;
}

export function selfTarget(api: Api): PlanTarget {
  return {
    key: ["me"],
    calendar: (from, to) => api.calendar(from, to),
    create: (input) => api.createPlan(input),
    update: (id, patch) => api.updatePlan(id, patch),
    remove: (id) => api.deletePlan(id),
    activity: (id) => api.activity(id),
    goal: () => api.goal(),
    saveGoal: (input) => api.saveGoal(input),
    canEditNotes: false,
  };
}

export function athleteTarget(api: Api, athleteId: string): PlanTarget {
  return {
    key: ["athlete", athleteId],
    calendar: (from, to) => api.athleteCalendar(athleteId, from, to),
    create: (input) => api.createAthletePlan(athleteId, input),
    update: (id, patch) => api.updateAthletePlan(athleteId, id, patch),
    remove: (id) => api.deleteAthletePlan(athleteId, id),
    activity: (id) => api.athleteActivity(athleteId, id),
    goal: () => api.athleteGoal(athleteId),
    saveGoal: (input) => api.saveAthleteGoal(athleteId, input),
    canEditNotes: true,
  };
}
