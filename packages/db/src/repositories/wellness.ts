import type { LocalDate, Vendor, WellnessRecord } from "@activen/domain";
import { and, asc, between, eq } from "drizzle-orm";
import type { Db } from "../client.js";
import { dailyWellness } from "../schema.js";

type Row = typeof dailyWellness.$inferSelect;

const toRecord = (r: Row): WellnessRecord => ({
  calendarDate: r.calendarDate,
  source: r.source,
  sleepDurationInSeconds: r.sleepDurationInSeconds,
  sleepScore: r.sleepScore,
  sleepQuality: r.sleepQuality,
  restingHeartRate: r.restingHeartRate,
  lastNightHrvMs: r.lastNightHrvMs,
  vendorReadiness: r.vendorReadiness,
});

/** Daily recovery data per source; merging across sources happens on read (domain). */
export class WellnessRepository {
  constructor(private readonly db: Db) {}

  /**
   * Writes one source's values for a day, replacing what that source had. A record with no values
   * deletes the row (e.g. the athlete clears the morning input).
   */
  async put(userId: string, record: WellnessRecord): Promise<void> {
    const values = {
      sleepDurationInSeconds: record.sleepDurationInSeconds,
      sleepScore: record.sleepScore,
      sleepQuality: record.sleepQuality,
      restingHeartRate: record.restingHeartRate,
      lastNightHrvMs: record.lastNightHrvMs,
      vendorReadiness: record.vendorReadiness,
    };
    if (Object.values(values).every((v) => v === null)) {
      await this.db
        .delete(dailyWellness)
        .where(
          and(
            eq(dailyWellness.userId, userId),
            eq(dailyWellness.calendarDate, record.calendarDate),
            eq(dailyWellness.source, record.source),
          ),
        );
      return;
    }
    await this.db
      .insert(dailyWellness)
      .values({ userId, calendarDate: record.calendarDate, source: record.source, ...values })
      .onConflictDoUpdate({
        target: [dailyWellness.userId, dailyWellness.calendarDate, dailyWellness.source],
        set: { ...values, updatedAt: new Date() },
      });
  }

  /**
   * Merges a vendor's partial delivery (sleep and recharge arrive separately) into its row:
   * only the fields given are changed.
   */
  async patch(
    userId: string,
    calendarDate: LocalDate,
    source: Vendor,
    fields: Partial<Omit<WellnessRecord, "calendarDate" | "source">>,
  ): Promise<void> {
    const existing = (await this.range(userId, calendarDate, calendarDate)).find(
      (r) => r.source === source,
    );
    await this.put(userId, {
      calendarDate,
      source,
      sleepDurationInSeconds: null,
      sleepScore: null,
      sleepQuality: null,
      restingHeartRate: null,
      lastNightHrvMs: null,
      vendorReadiness: null,
      ...existing,
      ...fields,
    });
  }

  /** All sources' records in [from, to], oldest first. */
  async range(userId: string, from: LocalDate, to: LocalDate): Promise<WellnessRecord[]> {
    const rows = await this.db
      .select()
      .from(dailyWellness)
      .where(and(eq(dailyWellness.userId, userId), between(dailyWellness.calendarDate, from, to)))
      .orderBy(asc(dailyWellness.calendarDate), asc(dailyWellness.source));
    return rows.map(toRecord);
  }

  /** Removes everything a source delivered (on disconnect). */
  async removeSource(userId: string, source: Vendor): Promise<number> {
    const rows = await this.db
      .delete(dailyWellness)
      .where(and(eq(dailyWellness.userId, userId), eq(dailyWellness.source, source)))
      .returning({ d: dailyWellness.calendarDate });
    return rows.length;
  }
}
