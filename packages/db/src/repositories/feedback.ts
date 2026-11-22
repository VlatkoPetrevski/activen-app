import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { activityFeedback, sourceActivities } from "../schema.js";

export interface FeedbackInput {
  /** 1 (very easy) … 10 (maximal). */
  perceivedEffort: number | null;
  /** 1 (very weak) … 5 (very strong). */
  feel: number | null;
  comment: string | null;
  language: string | null;
}

export type FeedbackSource = "athlete" | "device";

export interface Feedback extends FeedbackInput {
  /** Where the rating came from: entered in ActiveN, or rated on the watch. */
  source: FeedbackSource;
  activityId: string;
  athleteId: string;
  updatedAt: Date;
}

const MAX_COMMENT = 2000;

type Row = typeof activityFeedback.$inferSelect;

const toFeedback = (row: Row): Feedback => ({
  activityId: row.activityId,
  athleteId: row.athleteId,
  perceivedEffort: row.perceivedEffort,
  feel: row.feel,
  comment: row.comment,
  language: row.language,
  source: row.source,
  updatedAt: row.updatedAt,
});

export class FeedbackRepository {
  constructor(private readonly db: Db) {}

  /** Check-ins of the given activities, keyed by activity id. */
  async forActivities(activityIds: readonly string[]): Promise<Map<string, Feedback>> {
    if (activityIds.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(activityFeedback)
      .where(inArray(activityFeedback.activityId, [...activityIds]));
    return new Map(rows.map((r) => [r.activityId, toFeedback(r)]));
  }

  /**
   * The rating the athlete gave on the watch, read from the activity file. Only fills an empty
   * slot: never replaces what the athlete entered (or an earlier watch rating). True if stored.
   */
  async fromDevice(
    athleteId: string,
    activityId: string,
    rating: { perceivedEffort: number | null; feel: number | null },
  ): Promise<boolean> {
    const valid = (v: number | null, hi: number) =>
      v !== null && Number.isInteger(v) && v >= 1 && v <= hi ? v : null;
    const perceivedEffort = valid(rating.perceivedEffort, 10);
    const feel = valid(rating.feel, 5);
    if (perceivedEffort === null && feel === null) return false;
    const rows = await this.db
      .insert(activityFeedback)
      .values({ activityId, athleteId, perceivedEffort, feel, source: "device" })
      .onConflictDoNothing({ target: activityFeedback.activityId })
      .returning({ id: activityFeedback.id });
    return rows.length === 1;
  }

  /** The athlete's check-in for one of their own activities; saving again replaces it. */
  async upsert(athleteId: string, activityId: string, input: FeedbackInput): Promise<Feedback> {
    const { perceivedEffort: e, feel: f } = input;
    if (e !== null && (!Number.isInteger(e) || e < 1 || e > 10))
      throw new ValidationError("Perceived effort must be 1–10");
    if (f !== null && (!Number.isInteger(f) || f < 1 || f > 5))
      throw new ValidationError("Feel must be 1–5");
    const comment = input.comment?.trim() || null;
    if (comment && comment.length > MAX_COMMENT)
      throw new ValidationError(`Comment is longer than ${MAX_COMMENT} characters`);

    const [own] = await this.db
      .select({ id: sourceActivities.id })
      .from(sourceActivities)
      .where(and(eq(sourceActivities.id, activityId), eq(sourceActivities.userId, athleteId)));
    if (!own) throw new NotFoundError("activity", activityId);

    const values = {
      activityId,
      athleteId,
      perceivedEffort: e,
      feel: f,
      comment,
      language: input.language,
      source: "athlete" as const,
    };
    const [row] = await this.db
      .insert(activityFeedback)
      .values(values)
      .onConflictDoUpdate({
        target: activityFeedback.activityId,
        set: { ...values, updatedAt: sql`now()` },
      })
      .returning();
    if (!row) throw new Error("upsert activity_feedback returned no row");
    return toFeedback(row);
  }
}
