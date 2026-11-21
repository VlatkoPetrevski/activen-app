import {
  activityInsights,
  analyticsRange,
  athleteAnalytics,
  type AthleteAnalyticsDto,
  calendarView,
  coachViewer,
  feedbackAs,
  OWNER,
  type Viewer,
  coachRowRange,
  coachRowView,
  progressView,
  type ActivityDetailDto,
  type ActivityDto,
  type CalendarDto,
  type CoachAthleteDto,
  type CommentDto,
  type ConsentScope,
  type FeedbackDto,
  type PlanEntryDto,
  type ProgressDto,
} from "@activen/contracts";
import {
  NotFoundError,
  type Comment,
  type Feedback,
  type Repositories,
  type StoredPlanEntry,
} from "@activen/db";
import {
  addDays,
  canDisplay,
  localDateOf,
  mergeActivities,
  weekStart,
  type Activity,
  type Audience,
  type LocalDate,
  type MergedActivity,
} from "@activen/domain";
import { Inject, Injectable } from "@nestjs/common";
import { REPOSITORIES } from "../tokens.js";

const toPlanDto = ({ language: _l, ...e }: StoredPlanEntry): PlanEntryDto => e;

const toFeedbackDto = (f: Feedback): FeedbackDto => ({
  perceivedEffort: f.perceivedEffort,
  feel: f.feel,
  comment: f.comment,
  updatedAt: f.updatedAt.toISOString(),
});

/**
 * Loads data for the training views shared by the athlete and the coach; the views themselves are
 * pure builders in @activen/contracts. Vendor data-sharing rules (ADR-0003) are applied here: a
 * coach never receives activities from sources that forbid it.
 */
@Injectable()
export class TrainingService {
  constructor(@Inject(REPOSITORIES) private readonly repos: Repositories) {}

  async today(athleteId: string): Promise<LocalDate> {
    const { timeZone } = await this.repos.settings.get(athleteId);
    return localDateOf(new Date().toISOString(), timeZone);
  }

  async calendar(
    athleteId: string,
    from: LocalDate,
    to: LocalDate,
    viewer: Viewer = OWNER,
  ): Promise<CalendarDto> {
    const entries = (await this.repos.plans.listByDateRange(athleteId, from, to)).map(toPlanDto);
    const groups = viewer.activities
      ? await this.mergedActivities(athleteId, from, to, viewer.audience)
      : [];
    const activities = groups.map((g) => g.activity);
    return calendarView({
      athleteId,
      from,
      to,
      entries,
      activities,
      overrides: await this.repos.plans.overridesFor(entries.map((e) => e.id)),
      feedback: await this.feedbackFor(groups, viewer),
      activitiesVisible: viewer.activities,
    });
  }

  async activities(athleteId: string, from: LocalDate, to: LocalDate): Promise<ActivityDto[]> {
    const groups = await this.mergedActivities(athleteId, from, to, "owner");
    const feedback = await this.feedbackFor(groups, OWNER);
    return groups
      .map(({ activity: a }) => ({ ...a, feedback: feedback.get(a.id) ?? null }))
      .sort((a, b) => b.startTimeInSeconds - a.startTimeInSeconds);
  }

  /**
   * One activity with its plan, laps and source. Coaches never see Strava activities
   * (Strava API terms) and see comments only with the "comments" consent.
   */
  async activityDetail(
    athleteId: string,
    activityId: string,
    viewer: Viewer = OWNER,
  ): Promise<ActivityDetailDto> {
    const { audience } = viewer;
    const stored = await this.repos.activities.get(athleteId, activityId);
    if (!viewer.activities || !canDisplay(stored.source.vendor, audience))
      throw new NotFoundError("activity", activityId);
    // The workout as shown: an id of any of its sources opens the merged activity.
    const groups = await this.mergedActivities(
      athleteId,
      stored.calendarDate,
      stored.calendarDate,
      audience,
    );
    const group = groups.find((g) => g.sourceIds.includes(activityId));
    if (!group) throw new NotFoundError("activity", activityId);
    const activity = group.activity;
    // Same audience as the caller, so plan ↔ activity links match what they see in the calendar.
    const day = await this.calendar(
      athleteId,
      activity.calendarDate,
      activity.calendarDate,
      viewer,
    );
    const link = day.links.find((l) => l.activityId === activity.id);
    const planEntry = day.entries.find((e) => e.id === link?.planEntryId) ?? null;
    const recent = await this.visibleActivities(
      athleteId,
      addDays(activity.calendarDate, -28),
      activity.calendarDate,
      audience,
    );
    const detail = await this.detailOf(group, viewer);
    return {
      activity: day.activities.find((a) => a.id === activity.id) ?? { ...activity, feedback: null },
      ...detail,
      planEntry,
      comments: viewer.comments ? await this.comments(athleteId, { activityId: activity.id }) : [],
      insights: activityInsights(activity, recent, planEntry),
    };
  }

  /**
   * Laps, route, device and exercises of a workout, each from the most trusted source that has it
   * (a Polar sync without laps takes them from an uploaded FIT). The route only with `location`.
   */
  private async detailOf(
    group: MergedActivity,
    viewer: Viewer,
  ): Promise<Pick<ActivityDetailDto, "laps" | "route" | "device" | "exercises">> {
    const details = await this.repos.activityFiles.details(group.sourceIds);
    const ordered = group.sourceIds.flatMap((id, i) => {
      const d = details.get(id);
      const source = group.sources[i];
      return d && source ? [{ ...d, vendor: source.vendor }] : [];
    });
    const withLaps = ordered.find((d) => d.laps.length > 0);
    const withRoute = ordered.find((d) => d.route && d.route.length > 1);
    const withDevice = ordered.find((d) => d.device);
    const withSets = ordered.find((d) => d.exercises.length > 0);
    return {
      // Numbered from 1, as athletes and devices count laps.
      laps: (withLaps?.laps ?? []).map((l, index) => ({
        index: index + 1,
        intensity: l.intensity,
        startOffsetInSeconds: l.startOffsetInSeconds,
        durationInSeconds: l.durationInSeconds,
        distanceInMeters: l.distanceInMeters,
        averageHeartRateInBeatsPerMinute: l.averageHeartRateInBeatsPerMinute,
        maxHeartRateInBeatsPerMinute: l.maxHeartRateInBeatsPerMinute,
      })),
      route: viewer.location && withRoute?.route ? { points: withRoute.route } : null,
      exercises: withSets?.exercises ?? [],
      device: {
        vendor: withDevice?.vendor ?? group.activity.source.vendor,
        deviceName: withDevice?.device?.deviceName ?? null,
        heartRateSensor: withDevice?.device?.heartRateSensor ?? null,
        heartRateSensorName: null,
      },
    };
  }

  /** 404 unless the coach may see this activity (activities consent and a displayable source). */
  async assertVisible(athleteId: string, activityId: string, viewer: Viewer): Promise<void> {
    const activity = await this.repos.activities.get(athleteId, activityId);
    if (!viewer.activities || !canDisplay(activity.source.vendor, viewer.audience))
      throw new NotFoundError("activity", activityId);
  }

  async progress(athleteId: string, weeks: number, viewer: Viewer = OWNER): Promise<ProgressDto> {
    const today = await this.today(athleteId);
    const from = addDays(weekStart(today), -7 * (weeks - 1) - 28);
    return progressView(
      viewer.activities
        ? await this.visibleActivities(athleteId, from, today, viewer.audience)
        : [],
      today,
      weeks,
    );
  }

  async comments(
    athleteId: string,
    options: { activityId?: string; before?: Date } = {},
  ): Promise<CommentDto[]> {
    return this.commentDtos(await this.repos.comments.list(athleteId, options));
  }

  async commentDtos(list: Comment[]): Promise<CommentDto[]> {
    const names = await this.repos.users.displayNames([
      ...new Set(list.map((c) => c.authorId).filter((id): id is string => id !== null)),
    ]);
    return list.map((c) => ({
      id: c.id,
      athleteId: c.athleteId,
      authorId: c.authorId,
      authorName: c.authorId ? (names.get(c.authorId) ?? null) : null,
      activityId: c.activityId,
      planEntryId: c.planEntryId,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  /** Coach analytics of one athlete; activity data only with the "activities" consent. */
  async analytics(
    athleteId: string,
    displayName: string,
    scopes: ConsentScope[],
  ): Promise<AthleteAnalyticsDto> {
    const today = await this.today(athleteId);
    const range = analyticsRange(today);
    const calendar = await this.calendar(athleteId, range.from, range.to, coachViewer(scopes));
    return athleteAnalytics({
      athleteId,
      displayName,
      scopes,
      calendar,
      today,
      // Morning wellness arrives with the device integrations; shared only with consent.
      wellness: scopes.includes("sleep_recovery") ? [] : null,
    });
  }

  async coachAthlete(
    link: { id: string; athleteId: string; status: "invited" | "active" | "ended" },
    displayName: string,
    scopes: CoachAthleteDto["scopes"],
  ): Promise<CoachAthleteDto> {
    const status = link.status === "active" ? "active" : "invited";
    const base = {
      linkId: link.id,
      athleteId: link.athleteId,
      displayName,
      status,
      scopes,
    } as const;
    const settings = await this.repos.settings.get(link.athleteId);
    const today = localDateOf(new Date().toISOString(), settings.timeZone);
    if (status !== "active") return coachRowView({ ...base, primarySource: null, today });
    const range = coachRowRange(today);
    const calendar = await this.calendar(link.athleteId, range.from, range.to, coachViewer(scopes));
    const [last] = await this.repos.comments.list(link.athleteId, { limit: 1 });
    return coachRowView({
      ...base,
      primarySource: settings.sourcePriority[0] ?? null,
      today,
      calendar,
      lastComment: last
        ? { body: last.body, createdAt: last.createdAt.toISOString(), authorId: last.authorId }
        : null,
    });
  }

  /**
   * Check-ins keyed by the shown (merged) activity. A check-in given on any source of the workout
   * counts, the latest one wins: it survives a higher-priority source arriving later. The written
   * comment only for viewers with the "comments" consent.
   */
  private async feedbackFor(
    groups: readonly MergedActivity[],
    viewer: Viewer,
  ): Promise<Map<string, FeedbackDto>> {
    const map = await this.repos.feedback.forActivities(groups.flatMap((g) => g.sourceIds));
    const out = new Map<string, FeedbackDto>();
    for (const g of groups) {
      const latest = g.sourceIds
        .map((id) => map.get(id))
        .filter((f): f is Feedback => f !== undefined)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
      if (latest) out.set(g.activity.id, feedbackAs(toFeedbackDto(latest), viewer));
    }
    return out;
  }

  /**
   * The athlete's workouts as shown: the same workout recorded by several sources (a Polar sync and
   * an uploaded FIT, Garmin and Strava) appears once, from the source the athlete trusts most,
   * with gaps filled by the others (ADR-0002). Sources hidden from the audience never take part.
   */
  private async mergedActivities(
    athleteId: string,
    from: LocalDate,
    to: LocalDate,
    audience: Audience,
  ): Promise<MergedActivity[]> {
    const [list, settings] = await Promise.all([
      this.repos.activities.listByDateRange(athleteId, from, to),
      this.repos.settings.get(athleteId),
    ]);
    return mergeActivities(list, { audience, priority: settings.sourcePriority });
  }

  private async visibleActivities(
    athleteId: string,
    from: LocalDate,
    to: LocalDate,
    audience: Audience,
  ): Promise<Activity[]> {
    return (await this.mergedActivities(athleteId, from, to, audience)).map((g) => g.activity);
  }
}
