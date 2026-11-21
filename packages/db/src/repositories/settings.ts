import {
  DEFAULT_ATHLETE_SETTINGS,
  isClockTime,
  isLocalDate,
  type AthleteSettings,
  type HrZoneSourceSetting,
} from "@activen/domain";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { ValidationError } from "../errors.js";
import { athleteSettings } from "../schema.js";

type Row = typeof athleteSettings.$inferSelect;

function toDomain(row: Row): AthleteSettings {
  const hrZones: HrZoneSourceSetting =
    row.hrZoneMode === "vendor" && row.hrZoneVendor && row.hrZoneVendor !== "manual"
      ? { mode: "vendor", vendor: row.hrZoneVendor }
      : row.hrZoneMode === "manual"
        ? { mode: "manual" }
        : { mode: "source" };
  return {
    locale: row.locale,
    unitSystem: row.unitSystem,
    timeZone: row.timeZone,
    sourcePriority: row.sourcePriority,
    hrZones,
    maxHeartRate: row.maxHeartRate,
    birthDate: row.birthDate,
    workoutSuggestions: row.workoutSuggestions,
    sleepNeedMinutes: row.sleepNeedMinutes,
    briefingReminder: { enabled: row.briefingReminder, time: row.briefingTime },
  };
}

function validate(s: AthleteSettings): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone: s.timeZone });
  } catch {
    throw new ValidationError(`Unknown time zone: ${s.timeZone}`);
  }
  if (s.birthDate !== null && !isLocalDate(s.birthDate))
    throw new ValidationError(`Invalid birth date: ${s.birthDate}`);
  if (s.maxHeartRate !== null && (s.maxHeartRate < 100 || s.maxHeartRate > 250))
    throw new ValidationError("Max heart rate must be 100–250 bpm");
  if (!Number.isInteger(s.sleepNeedMinutes) || s.sleepNeedMinutes < 300 || s.sleepNeedMinutes > 720)
    throw new ValidationError("Sleep need must be 300–720 minutes");
  if (!isClockTime(s.briefingReminder.time))
    throw new ValidationError(`Invalid reminder time: ${s.briefingReminder.time}`);
  if (new Set(s.sourcePriority).size !== s.sourcePriority.length)
    throw new ValidationError("Source priority contains duplicates");
}

export class SettingsRepository {
  constructor(private readonly db: Db) {}

  /** Stored settings, or the defaults when the athlete has not saved any yet. */
  async get(userId: string): Promise<AthleteSettings> {
    const [row] = await this.db
      .select()
      .from(athleteSettings)
      .where(eq(athleteSettings.userId, userId));
    return row
      ? toDomain(row)
      : {
          ...DEFAULT_ATHLETE_SETTINGS,
          briefingReminder: { ...DEFAULT_ATHLETE_SETTINGS.briefingReminder },
        };
  }

  async save(userId: string, settings: AthleteSettings): Promise<AthleteSettings> {
    validate(settings);
    const values = {
      userId,
      locale: settings.locale,
      unitSystem: settings.unitSystem,
      timeZone: settings.timeZone,
      sourcePriority: [...settings.sourcePriority],
      hrZoneMode: settings.hrZones.mode,
      hrZoneVendor: settings.hrZones.mode === "vendor" ? settings.hrZones.vendor : null,
      maxHeartRate: settings.maxHeartRate,
      birthDate: settings.birthDate,
      workoutSuggestions: settings.workoutSuggestions,
      sleepNeedMinutes: settings.sleepNeedMinutes,
      briefingReminder: settings.briefingReminder.enabled,
      briefingTime: settings.briefingReminder.time,
    };
    const [row] = await this.db
      .insert(athleteSettings)
      .values(values)
      .onConflictDoUpdate({
        target: athleteSettings.userId,
        set: { ...values, updatedAt: sql`now()` },
      })
      .returning();
    if (!row) throw new Error("upsert athlete_settings returned no row");
    return toDomain(row);
  }
}
