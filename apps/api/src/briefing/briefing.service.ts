import {
  BRIEFING_HISTORY_DAYS,
  buildBriefing,
  wellnessSeries,
  type BriefingDto,
  type MorningInputDto,
  type Viewer,
  type WellnessDto,
} from "@activen/contracts";
import { ValidationError, type Repositories, type StoredPlanEntry } from "@activen/db";
import {
  addDays,
  localDateOf,
  mergeActivities,
  type Audience,
  type LocalDate,
} from "@activen/domain";
import { Inject, Injectable } from "@nestjs/common";
import { REPOSITORIES } from "../tokens.js";

/** How far back the athlete may correct a morning input. */
export const MORNING_INPUT_MAX_DAYS_BACK = 7;

const toPlanDto = ({ language: _l, ...e }: StoredPlanEntry) => e;

/**
 * The morning briefing (ADR-0013): readiness from measured sleep, resting HR, HRV and training
 * load, and the advice for today's session. Assembled by the shared `buildBriefing`, so the
 * athlete, the coach, the email and the demo all say the same thing.
 */
@Injectable()
export class BriefingService {
  constructor(@Inject(REPOSITORIES) private readonly repos: Repositories) {}

  async today(athleteId: string, now = new Date()): Promise<LocalDate> {
    const { timeZone } = await this.repos.settings.get(athleteId);
    return localDateOf(now.toISOString(), timeZone);
  }

  async briefing(
    athleteId: string,
    date?: LocalDate,
    viewer?: Pick<Viewer, "audience" | "activities">,
  ): Promise<BriefingDto> {
    const settings = await this.repos.settings.get(athleteId);
    const day = date ?? localDateOf(new Date().toISOString(), settings.timeZone);
    const from = addDays(day, -BRIEFING_HISTORY_DAYS);
    const [records, activities, entries] = await Promise.all([
      this.repos.wellness.range(athleteId, from, day),
      this.activities(athleteId, from, addDays(day, -1), viewer?.audience ?? "owner"),
      this.repos.plans.listByDateRange(athleteId, day, day),
    ]);
    return buildBriefing({
      athleteId,
      calendarDate: day,
      records,
      priority: settings.sourcePriority,
      activities,
      entries: entries.map(toPlanDto),
      sleepNeedMinutes: settings.sleepNeedMinutes,
      ...(viewer ? { viewer } : {}),
    });
  }

  /** Daily wellness with ActiveN readiness, for charts. */
  async series(
    athleteId: string,
    from: LocalDate,
    to: LocalDate,
    audience: Audience,
  ): Promise<WellnessDto[]> {
    const settings = await this.repos.settings.get(athleteId);
    const start = addDays(from, -BRIEFING_HISTORY_DAYS);
    const [records, activities] = await Promise.all([
      this.repos.wellness.range(athleteId, start, to),
      this.activities(athleteId, start, to, audience),
    ]);
    return wellnessSeries({
      from,
      to,
      records,
      priority: settings.sourcePriority,
      activities,
      sleepNeedMinutes: settings.sleepNeedMinutes,
    });
  }

  /**
   * Saves what the athlete measured this morning (sleep and resting pulse). Not for future days
   * and at most a week back; both values null removes the input.
   */
  async saveMorningInput(
    athleteId: string,
    date: LocalDate,
    input: MorningInputDto,
  ): Promise<BriefingDto> {
    const today = await this.today(athleteId);
    if (date > today) throw new ValidationError("The morning input cannot be for a future day");
    if (date < addDays(today, -MORNING_INPUT_MAX_DAYS_BACK))
      throw new ValidationError(
        `The morning input can be corrected at most ${MORNING_INPUT_MAX_DAYS_BACK} days back`,
      );
    await this.repos.wellness.put(athleteId, {
      calendarDate: date,
      source: "manual",
      sleepDurationInSeconds: input.sleepDurationInSeconds,
      sleepScore: null,
      restingHeartRate: input.restingHeartRate,
      lastNightHrvMs: null,
      vendorReadiness: null,
    });
    return this.briefing(athleteId, date);
  }

  private async activities(athleteId: string, from: LocalDate, to: LocalDate, audience: Audience) {
    const [list, settings] = await Promise.all([
      this.repos.activities.listByDateRange(athleteId, from, to),
      this.repos.settings.get(athleteId),
    ]);
    return mergeActivities(list, { audience, priority: settings.sourcePriority }).map(
      (g) => g.activity,
    );
  }
}
