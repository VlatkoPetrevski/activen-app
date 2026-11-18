import {
  isLocalDate,
  validateZones,
  type HrZone,
  type HrZoneProfile,
  type LocalDate,
  type Vendor,
} from "@activen/domain";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { ValidationError } from "../errors.js";
import { hrZoneProfiles } from "../schema.js";

export interface NewZoneProfile {
  userId: string;
  source: Vendor;
  name: string;
  effectiveFrom: LocalDate;
  zones: HrZone[];
}

export class HrZonesRepository {
  constructor(private readonly db: Db) {}

  /**
   * Adds a new immutable version for (athlete, source) — HR-05: boundaries are never edited in place.
   * A transaction-scoped advisory lock serializes concurrent versions for the same athlete/source.
   */
  async addVersion(input: NewZoneProfile): Promise<HrZoneProfile> {
    const errors = validateZones(input.zones);
    if (errors.length) throw new ValidationError("Invalid HR zones", errors);
    if (!isLocalDate(input.effectiveFrom))
      throw new ValidationError(`Invalid effectiveFrom: ${input.effectiveFrom}`);

    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.userId} || ':' || ${input.source}))`,
      );
      const [{ next } = { next: 1 }] = await tx
        .select({ next: sql<number>`coalesce(max(${hrZoneProfiles.version}), 0) + 1` })
        .from(hrZoneProfiles)
        .where(
          and(eq(hrZoneProfiles.userId, input.userId), eq(hrZoneProfiles.source, input.source)),
        );
      const [row] = await tx
        .insert(hrZoneProfiles)
        .values({ ...input, version: Number(next) })
        .returning();
      if (!row) throw new Error("insert hr_zone_profiles returned no row");
      return toProfile(row);
    });
  }

  async list(userId: string): Promise<HrZoneProfile[]> {
    const rows = await this.db
      .select()
      .from(hrZoneProfiles)
      .where(eq(hrZoneProfiles.userId, userId))
      .orderBy(asc(hrZoneProfiles.effectiveFrom), asc(hrZoneProfiles.version));
    return rows.map(toProfile);
  }
}

function toProfile(row: typeof hrZoneProfiles.$inferSelect): HrZoneProfile {
  return {
    id: row.id,
    athleteId: row.userId,
    source: row.source,
    name: row.name,
    version: row.version,
    effectiveFrom: row.effectiveFrom,
    zones: row.zones as HrZone[],
  };
}
