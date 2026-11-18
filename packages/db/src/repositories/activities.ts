import { isActivityType, type Activity, type LocalDate, type Vendor } from "@activen/domain";
import { and, asc, between, eq, getTableColumns, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { sourceActivities } from "../schema.js";

type Row = typeof sourceActivities.$inferSelect;

/** A normalized activity as produced by a vendor adapter, ready to store. */
export type SourceActivityInput = Omit<Activity, "id" | "athleteId" | "source" | "deleted"> & {
  userId: string;
  vendor: Vendor;
  externalId: string;
  raw?: unknown;
};

export function toActivity(row: Row): Activity {
  return {
    id: row.id,
    athleteId: row.userId,
    source: { vendor: row.vendor, externalId: row.externalId },
    activityName: row.activityName,
    activityType: isActivityType(row.activityType) ? row.activityType : "OTHER",
    calendarDate: row.calendarDate,
    startTimeInSeconds: row.startTimeInSeconds,
    startTimeOffsetInSeconds: row.startTimeOffsetInSeconds,
    distanceInMeters: row.distanceInMeters,
    durationInSeconds: row.durationInSeconds,
    movingDurationInSeconds: row.movingDurationInSeconds,
    totalElevationGainInMeters: row.totalElevationGainInMeters,
    trainingLoad: row.trainingLoad,
    averageHeartRateInBeatsPerMinute: row.averageHeartRateInBeatsPerMinute,
    maxHeartRateInBeatsPerMinute: row.maxHeartRateInBeatsPerMinute,
    averagePowerInWatts: row.averagePowerInWatts,
    activeKilocalories: row.activeKilocalories,
    gearName: row.gearName,
    isRace: row.isRace,
    deleted: row.deleted,
  };
}

export class ActivitiesRepository {
  constructor(private readonly db: Db) {}

  /**
   * Idempotent store (SYNC-05): the same vendor activity received again updates the row instead
   * of creating a duplicate. A re-sent activity also un-deletes a previously deleted one.
   */
  async upsert(input: SourceActivityInput): Promise<{ activity: Activity; created: boolean }> {
    const { userId, vendor, externalId, raw, ...fields } = input;
    const values = { ...fields, userId, vendor, externalId, raw: raw ?? null, deleted: false };
    const [row] = await this.db
      .insert(sourceActivities)
      .values(values)
      .onConflictDoUpdate({
        target: [sourceActivities.vendor, sourceActivities.externalId],
        set: { ...values, updatedAt: sql`now()` },
      })
      .returning({ ...getTableColumns(sourceActivities), inserted: sql<boolean>`(xmax = 0)` });
    if (!row) throw new Error("upsert source_activities returned no row");
    const { inserted, ...stored } = row;
    return { activity: toActivity(stored), created: inserted };
  }

  /** SYNC-04: the source deleted the activity; keep it soft-deleted and out of analytics. */
  async markDeleted(vendor: Vendor, externalId: string): Promise<boolean> {
    const rows = await this.db
      .update(sourceActivities)
      .set({ deleted: true, updatedAt: sql`now()` })
      .where(and(eq(sourceActivities.vendor, vendor), eq(sourceActivities.externalId, externalId)))
      .returning({ id: sourceActivities.id });
    return rows.length > 0;
  }

  /** Activities of one athlete in an inclusive local-date range, oldest first. */
  async listByDateRange(
    userId: string,
    from: LocalDate,
    to: LocalDate,
    options: { includeDeleted?: boolean } = {},
  ): Promise<Activity[]> {
    const rows = await this.db
      .select()
      .from(sourceActivities)
      .where(
        and(
          eq(sourceActivities.userId, userId),
          between(sourceActivities.calendarDate, from, to),
          options.includeDeleted ? undefined : eq(sourceActivities.deleted, false),
        ),
      )
      .orderBy(asc(sourceActivities.startTimeInSeconds));
    return rows.map(toActivity);
  }
}
