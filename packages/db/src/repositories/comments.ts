import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { comments, planEntries, sourceActivities } from "../schema.js";

export interface Comment {
  id: string;
  athleteId: string;
  authorId: string | null;
  activityId: string | null;
  planEntryId: string | null;
  body: string;
  language: string | null;
  createdAt: Date;
}

export interface CommentInput {
  body: string;
  activityId?: string | null;
  planEntryId?: string | null;
  language?: string | null;
}

const MAX_BODY = 4000;

/**
 * The athlete ↔ coach thread. Who may read or write is checked by the caller; that a comment
 * only refers to the athlete's own activity and plan entry is enforced here, for every caller
 * (a foreign id answers like a missing one).
 */
export class CommentsRepository {
  constructor(private readonly db: Db) {}

  async add(athleteId: string, authorId: string, input: CommentInput): Promise<Comment> {
    const body = input.body.trim();
    if (!body || body.length > MAX_BODY)
      throw new ValidationError(`Comment must be 1–${MAX_BODY} characters`);
    await this.assertOwnReferences(athleteId, input);
    const [row] = await this.db
      .insert(comments)
      .values({
        athleteId,
        authorId,
        body,
        activityId: input.activityId ?? null,
        planEntryId: input.planEntryId ?? null,
        language: input.language ?? null,
      })
      .returning();
    if (!row) throw new Error("insert comments returned no row");
    return row;
  }

  private async assertOwnReferences(athleteId: string, input: CommentInput): Promise<void> {
    if (input.activityId) {
      const [own] = await this.db
        .select({ id: sourceActivities.id })
        .from(sourceActivities)
        .where(
          and(eq(sourceActivities.id, input.activityId), eq(sourceActivities.userId, athleteId)),
        );
      if (!own) throw new NotFoundError("activity", input.activityId);
    }
    if (input.planEntryId) {
      const [own] = await this.db
        .select({ id: planEntries.id })
        .from(planEntries)
        .where(and(eq(planEntries.id, input.planEntryId), eq(planEntries.athleteId, athleteId)));
      if (!own) throw new NotFoundError("plan entry", input.planEntryId);
    }
  }

  /** Newest first; `before` pages backwards. */
  async list(
    athleteId: string,
    options: { activityId?: string; before?: Date; limit?: number } = {},
  ): Promise<Comment[]> {
    return this.db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.athleteId, athleteId),
          options.activityId ? eq(comments.activityId, options.activityId) : undefined,
          options.before ? lt(comments.createdAt, options.before) : undefined,
        ),
      )
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(Math.min(options.limit ?? 50, 200));
  }

  /** Latest comment per athlete, for inbox-style lists. */
  async latestFor(athleteIds: readonly string[]): Promise<Map<string, Comment>> {
    if (athleteIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([comments.athleteId])
      .from(comments)
      .where(sql`${comments.athleteId} in ${athleteIds}`)
      .orderBy(comments.athleteId, desc(comments.createdAt));
    return new Map(rows.map((r) => [r.athleteId, r]));
  }
}
