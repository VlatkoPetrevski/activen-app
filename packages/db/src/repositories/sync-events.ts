import type { Vendor } from "@activen/domain";
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { syncEvents } from "../schema.js";

export interface SyncEventInput {
  vendor: Vendor;
  objectId: string;
  /** e.g. "create", "update", "delete", "deauthorize". */
  aspect: string;
  eventTime: Date;
  payload?: unknown;
}

export type SyncEvent = typeof syncEvents.$inferSelect;

export class SyncEventsRepository {
  constructor(private readonly db: Db) {}

  /**
   * Records an incoming webhook event. The same event delivered again (vendors retry) is ignored:
   * `duplicate: true` and nothing is queued twice (SYNC-05).
   */
  async record(input: SyncEventInput): Promise<{ id: string | null; duplicate: boolean }> {
    const rows = await this.db
      .insert(syncEvents)
      .values({ ...input, payload: input.payload ?? null })
      .onConflictDoNothing({
        target: [syncEvents.vendor, syncEvents.objectId, syncEvents.aspect, syncEvents.eventTime],
      })
      .returning({ id: syncEvents.id });
    const id = rows[0]?.id ?? null;
    return { id, duplicate: id === null };
  }

  /**
   * Claims up to `limit` events for a worker and marks them `processing`. `FOR UPDATE SKIP LOCKED`
   * lets several workers run in parallel without taking the same event. A claim older than
   * `leaseSeconds` (worker crashed) makes the event claimable again.
   */
  async claimPending(limit: number, leaseSeconds = 600): Promise<SyncEvent[]> {
    const result = await this.db.execute<{ id: string }>(sql`
      update ${syncEvents}
      set status = 'processing', claimed_at = now(), attempts = attempts + 1
      where id in (
        select id from ${syncEvents}
        where status = 'pending'
           or (status = 'processing' and claimed_at < now() - make_interval(secs => ${leaseSeconds}))
        order by received_at
        limit ${limit}
        for update skip locked
      )
      returning id`);
    const ids = result.rows.map((r) => r.id);
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(syncEvents)
      .where(inArray(syncEvents.id, ids))
      .orderBy(asc(syncEvents.receivedAt));
  }

  async markProcessed(id: string): Promise<void> {
    await this.db
      .update(syncEvents)
      .set({ status: "processed", processedAt: sql`now()`, lastError: null })
      .where(eq(syncEvents.id, id));
  }

  /** Failed attempt: back to pending for a retry, or `failed` once `maxAttempts` is reached. */
  async markFailed(id: string, error: string, maxAttempts = 5): Promise<"pending" | "failed"> {
    const [row] = await this.db
      .update(syncEvents)
      .set({
        lastError: error.slice(0, 2000),
        status: sql`case when ${syncEvents.attempts} >= ${maxAttempts} then 'failed'::sync_status else 'pending'::sync_status end`,
      })
      .where(eq(syncEvents.id, id))
      .returning({ status: syncEvents.status });
    return row?.status === "failed" ? "failed" : "pending";
  }
}
