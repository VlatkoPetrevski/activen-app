import type { ActivityDetail } from "@activen/domain";
import { and, count, desc, eq, inArray, max, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { activityDetails, activityFiles, sourceActivities } from "../schema.js";

export type ImportStatus = "imported" | "duplicate" | "failed";

export interface ActivityFileInput {
  userId: string;
  sha256: string;
  format: string | null;
  fileName: string;
  sizeBytes: number;
  storageKey: string | null;
  status: ImportStatus;
  activityId: string | null;
  errorCode: string | null;
}

export interface ActivityFile extends ActivityFileInput {
  id: string;
  createdAt: Date;
}

export interface ImportSummary {
  imported: number;
  lastImportAt: Date | null;
}

/** Uploaded files and the details (laps, samples, route, device) of detailed sources. */
export class ActivityFilesRepository {
  constructor(private readonly db: Db) {}

  async record(input: ActivityFileInput): Promise<ActivityFile> {
    const [row] = await this.db.insert(activityFiles).values(input).returning();
    if (!row) throw new Error("insert activity_files returned no row");
    return row;
  }

  /**
   * The activity an identical file already created, if that activity still exists (a file can be
   * uploaded again after its activity was deleted).
   */
  async importedActivityFor(userId: string, sha256: string): Promise<string | null> {
    const [row] = await this.db
      .select({ activityId: activityFiles.activityId })
      .from(activityFiles)
      .innerJoin(sourceActivities, eq(sourceActivities.id, activityFiles.activityId))
      .where(
        and(
          eq(activityFiles.userId, userId),
          eq(activityFiles.sha256, sha256),
          eq(activityFiles.status, "imported"),
          eq(sourceActivities.deleted, false),
        ),
      )
      .limit(1);
    return row?.activityId ?? null;
  }

  async summary(userId: string): Promise<ImportSummary> {
    const [row] = await this.db
      .select({ imported: count(), last: max(activityFiles.createdAt) })
      .from(activityFiles)
      .where(and(eq(activityFiles.userId, userId), eq(activityFiles.status, "imported")));
    return { imported: row?.imported ?? 0, lastImportAt: row?.last ?? null };
  }

  /** Newest first. */
  async list(userId: string, limit = 20): Promise<ActivityFile[]> {
    return this.db
      .select()
      .from(activityFiles)
      .where(eq(activityFiles.userId, userId))
      .orderBy(desc(activityFiles.createdAt))
      .limit(limit);
  }

  /** Storage keys of all the user's kept files (to delete the originals with the account). */
  async storageKeys(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ key: activityFiles.storageKey })
      .from(activityFiles)
      .where(and(eq(activityFiles.userId, userId), sql`${activityFiles.storageKey} is not null`));
    return rows.flatMap((r) => (r.key ? [r.key] : []));
  }

  async putDetail(activityId: string, detail: ActivityDetail): Promise<void> {
    const values = {
      activityId,
      laps: detail.laps,
      streams: detail.streams,
      route: detail.route,
      device: detail.device,
      exercises: detail.exercises,
    };
    await this.db
      .insert(activityDetails)
      .values(values)
      .onConflictDoUpdate({
        target: activityDetails.activityId,
        set: { ...values, updatedAt: sql`now()` },
      });
  }

  async detail(activityId: string): Promise<ActivityDetail | null> {
    return (await this.details([activityId])).get(activityId) ?? null;
  }

  /** Details of several activities at once (a merged activity reads every source's detail). */
  async details(activityIds: readonly string[]): Promise<Map<string, ActivityDetail>> {
    if (activityIds.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(activityDetails)
      .where(inArray(activityDetails.activityId, [...activityIds]));
    return new Map(
      rows.map((row) => [
        row.activityId,
        {
          laps: row.laps as ActivityDetail["laps"],
          streams: row.streams as ActivityDetail["streams"],
          route: row.route as ActivityDetail["route"],
          device: row.device as ActivityDetail["device"],
          exercises: row.exercises as ActivityDetail["exercises"],
        },
      ]),
    );
  }
}
