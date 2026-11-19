import { buildDemoTraining, type DemoLocale } from "@activen/contracts";
import type { LocalDate } from "@activen/domain";
import type { Repositories } from "./repositories/index.js";

export interface DemoSeedResult {
  activities: number;
  planEntries: number;
  feedback: number;
}

/**
 * Loads the demo training block for one user (development and review only). Activities are
 * upserted by external id, so running it again does not duplicate them; plan entries are added only
 * when the user has no plan in the period.
 */
export async function seedDemoData(
  repos: Repositories,
  userId: string,
  options: { today: LocalDate; locale?: DemoLocale },
): Promise<DemoSeedResult> {
  const demo = buildDemoTraining({ today: options.today, locale: options.locale ?? "mk" });
  const ids = new Map<string, string>();
  for (const a of demo.activities) {
    const { activity } = await repos.activities.upsert({ ...a, userId });
    ids.set(a.externalId, activity.id);
  }
  let feedback = 0;
  for (const f of demo.feedback) {
    const activityId = ids.get(f.externalId);
    if (!activityId) continue;
    await repos.feedback.upsert(userId, activityId, {
      perceivedEffort: f.perceivedEffort,
      feel: f.feel,
      comment: f.comment,
      language: options.locale ?? "mk",
    });
    feedback++;
  }
  const first = demo.planEntries[0]?.calendarDate;
  const last = demo.planEntries.at(-1)?.calendarDate;
  let planEntries = 0;
  if (first && last && (await repos.plans.listByDateRange(userId, first, last)).length === 0)
    for (const { key: _key, ...entry } of demo.planEntries) {
      await repos.plans.create(userId, { ...entry, language: options.locale ?? "mk" }, userId);
      planEntries++;
    }
  return { activities: demo.activities.length, planEntries, feedback };
}
