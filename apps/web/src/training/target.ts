import type { CalendarDto, PlanEntryDto } from "@activen/contracts";
import type { LocalDate } from "@activen/domain";
import type { Api, PlanInput, PlanPatch } from "../api/api.js";

/** Whose plan a screen works on: the signed-in athlete, or an athlete of the signed-in coach. */
export interface PlanTarget {
  key: readonly unknown[];
  calendar(from: LocalDate, to: LocalDate): Promise<CalendarDto>;
  create(input: PlanInput): Promise<PlanEntryDto>;
  update(id: string, patch: PlanPatch): Promise<PlanEntryDto>;
  remove(id: string): Promise<void>;
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
    canEditNotes: true,
  };
}
