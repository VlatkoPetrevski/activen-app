import type { PlanEntryCreate, PlanEntryUpdate } from "@activen/contracts/requests";
import { NotFoundError, type PlanEntryPatch, type Repositories } from "@activen/db";
import type { z } from "zod";

/** Plan changes for one athlete, made by the athlete or by their coach (the actor). */
export async function createPlanEntry(
  repos: Repositories,
  athleteId: string,
  actorId: string,
  input: z.output<typeof PlanEntryCreate>,
  language: string | null,
) {
  const { language: _l, ...entry } = await repos.plans.create(
    athleteId,
    { ...input, language },
    actorId,
  );
  return entry;
}

export async function updatePlanEntry(
  repos: Repositories,
  athleteId: string,
  actorId: string,
  entryId: string,
  input: z.output<typeof PlanEntryUpdate>,
) {
  await ownedEntry(repos, athleteId, entryId);
  const { expectedVersion, ...fields } = input;
  // Drop absent keys: an omitted field keeps its value.
  const patch = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined),
  ) as PlanEntryPatch;
  const { language: _l, ...entry } = await repos.plans.update(
    entryId,
    patch,
    expectedVersion,
    actorId,
  );
  return entry;
}

export async function removePlanEntry(repos: Repositories, athleteId: string, entryId: string) {
  await ownedEntry(repos, athleteId, entryId);
  await repos.plans.remove(entryId);
}

/** Entries of other athletes are reported as missing (no information leak). */
async function ownedEntry(repos: Repositories, athleteId: string, entryId: string) {
  const entry = await repos.plans.get(entryId);
  if (entry.athleteId !== athleteId) throw new NotFoundError("plan entry", entryId);
  return entry;
}
