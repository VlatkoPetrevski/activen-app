import {
  isActivityType,
  isLocalDate,
  type LocalDate,
  type PlanEntry,
  type PlanLinkOverride,
} from "@activen/domain";
import { and, asc, between, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { planEntries, planEntryVersions, planLinkOverrides } from "../schema.js";

type Row = typeof planEntries.$inferSelect;

export type PlanEntryInput = Omit<PlanEntry, "id" | "athleteId"> & { language?: string | null };
export type PlanEntryPatch = Partial<PlanEntryInput>;

export interface StoredPlanEntry extends PlanEntry {
  version: number;
  language: string | null;
}

function toEntry(row: Row): StoredPlanEntry {
  return {
    id: row.id,
    athleteId: row.athleteId,
    calendarDate: row.calendarDate,
    kind: row.kind,
    description: row.description,
    plannedActivityType:
      row.plannedActivityType && isActivityType(row.plannedActivityType)
        ? row.plannedActivityType
        : null,
    plannedDistanceInMeters: row.plannedDistanceInMeters,
    plannedDurationInSeconds: row.plannedDurationInSeconds,
    notes: row.notes,
    sequence: row.sequence,
    version: row.version,
    language: row.language,
  };
}

function validate(e: PlanEntryPatch): void {
  if (e.calendarDate !== undefined && !isLocalDate(e.calendarDate))
    throw new ValidationError(`Invalid date: ${e.calendarDate}`);
  if (e.plannedActivityType && !isActivityType(e.plannedActivityType))
    throw new ValidationError(`Unknown activity type: ${e.plannedActivityType}`);
  if (e.description !== undefined && !e.description.trim())
    throw new ValidationError("Description is required");
  for (const [k, v] of [
    ["plannedDistanceInMeters", e.plannedDistanceInMeters],
    ["plannedDurationInSeconds", e.plannedDurationInSeconds],
  ] as const)
    if (v !== undefined && v !== null && v < 0) throw new ValidationError(`${k} must be ≥ 0`);
}

const snapshot = (e: StoredPlanEntry) => {
  const { id: _id, athleteId: _a, version: _v, ...rest } = e;
  return rest;
};

export class PlansRepository {
  constructor(private readonly db: Db) {}

  async create(
    athleteId: string,
    input: PlanEntryInput,
    actorId: string,
  ): Promise<StoredPlanEntry> {
    validate(input);
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(planEntries)
        .values({ ...input, athleteId, createdBy: actorId, version: 1 })
        .returning();
      if (!row) throw new Error("insert plan_entries returned no row");
      const entry = toEntry(row);
      await tx.insert(planEntryVersions).values({
        planEntryId: entry.id,
        version: 1,
        snapshot: snapshot(entry),
        changedBy: actorId,
      });
      return entry;
    });
  }

  /**
   * Optimistic concurrency: the caller sends the version it edited; a concurrent change (coach and
   * athlete editing the same day) yields a ConflictError instead of a lost update. Every change is
   * kept in plan_entry_versions (PLAN-06).
   */
  async update(
    id: string,
    patch: PlanEntryPatch,
    expectedVersion: number,
    actorId: string,
  ): Promise<StoredPlanEntry> {
    validate(patch);
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(planEntries)
        .set({ ...patch, version: sql`${planEntries.version} + 1`, updatedAt: sql`now()` })
        .where(
          and(
            eq(planEntries.id, id),
            eq(planEntries.version, expectedVersion),
            isNull(planEntries.deletedAt),
          ),
        )
        .returning();
      if (!row) {
        const [current] = await tx.select().from(planEntries).where(eq(planEntries.id, id));
        if (!current || current.deletedAt) throw new NotFoundError("plan entry", id);
        throw new ConflictError(
          `Plan entry ${id} changed (version ${current.version}, expected ${expectedVersion})`,
        );
      }
      const entry = toEntry(row);
      await tx.insert(planEntryVersions).values({
        planEntryId: id,
        version: entry.version,
        snapshot: snapshot(entry),
        changedBy: actorId,
      });
      return entry;
    });
  }

  async remove(id: string): Promise<void> {
    const rows = await this.db
      .update(planEntries)
      .set({ deletedAt: sql`now()` })
      .where(and(eq(planEntries.id, id), isNull(planEntries.deletedAt)))
      .returning({ id: planEntries.id });
    if (!rows.length) throw new NotFoundError("plan entry", id);
  }

  async listByDateRange(
    athleteId: string,
    from: LocalDate,
    to: LocalDate,
  ): Promise<StoredPlanEntry[]> {
    const rows = await this.db
      .select()
      .from(planEntries)
      .where(
        and(
          eq(planEntries.athleteId, athleteId),
          between(planEntries.calendarDate, from, to),
          isNull(planEntries.deletedAt),
        ),
      )
      .orderBy(asc(planEntries.calendarDate), asc(planEntries.sequence));
    return rows.map(toEntry);
  }

  async history(id: string) {
    return this.db
      .select()
      .from(planEntryVersions)
      .where(eq(planEntryVersions.planEntryId, id))
      .orderBy(asc(planEntryVersions.version));
  }

  /** Manual link (rule 5); `activityId` null = explicitly unlinked. */
  async setOverride(
    planEntryId: string,
    activityId: string | null,
    actorId: string,
  ): Promise<void> {
    await this.db
      .insert(planLinkOverrides)
      .values({ planEntryId, activityId, setBy: actorId })
      .onConflictDoUpdate({
        target: planLinkOverrides.planEntryId,
        set: { activityId, setBy: actorId, setAt: sql`now()` },
      });
  }

  async clearOverride(planEntryId: string): Promise<void> {
    await this.db.delete(planLinkOverrides).where(eq(planLinkOverrides.planEntryId, planEntryId));
  }

  async overridesFor(planEntryIds: readonly string[]): Promise<PlanLinkOverride[]> {
    if (planEntryIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(planLinkOverrides)
      .where(inArray(planLinkOverrides.planEntryId, [...planEntryIds]));
    return rows.map((r) => ({ planEntryId: r.planEntryId, activityId: r.activityId }));
  }
}
