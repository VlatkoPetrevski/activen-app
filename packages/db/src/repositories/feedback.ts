import { and, eq, sql } from "drizzle-orm";
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

export interface Feedback extends FeedbackInput {
  activityId: string;
  athleteId: string;
  updatedAt: Date;
}

const MAX_COMMENT = 2000;

export class FeedbackRepository {
  constructor(private readonly db: Db) {}

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
    return {
      activityId: row.activityId,
      athleteId: row.athleteId,
      perceivedEffort: row.perceivedEffort,
      feel: row.feel,
      comment: row.comment,
      language: row.language,
      updatedAt: row.updatedAt,
    };
  }
}
