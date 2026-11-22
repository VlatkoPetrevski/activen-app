import { createHash } from "node:crypto";
import { importOutcome, type ImportResultDto, type ImportsSummaryDto } from "@activen/contracts";
import type { Repositories } from "@activen/db";
import { localDateOf, type Activity, type Vendor } from "@activen/domain";
import { createTranslator, negotiateLocale } from "@activen/i18n";
import {
  ImportError,
  parseActivityFile,
  simplifyRoute,
  trackOf,
  type ImportedActivity,
} from "@activen/importers";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { FILE_STORE, REPOSITORIES } from "../tokens.js";
import type { FileStore } from "./file-store.js";

export interface UploadedFile {
  fileName: string;
  bytes: Uint8Array;
}

/** Offset of a time zone from UTC at an instant, in seconds (DST-aware). */
export function zoneOffsetSeconds(timeZone: string, unixSeconds: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(unixSeconds * 1000));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round(asUtc / 1000 - unixSeconds);
}

/**
 * Turns uploaded activity files into activities, never showing one workout twice:
 * 1. the same file again (SHA-256) is a duplicate;
 * 2. the same workout from another file (FIT then GPX of one run) is a duplicate;
 * 3. the same workout already synced from a connected app joins it as a secondary source: the
 *    activity is shown once, from the app (higher priority), with the file filling gaps.
 * Every attempt is recorded; originals are kept to re-read them when the importers improve.
 */
@Injectable()
export class ImportService {
  private readonly log = new Logger(ImportService.name);

  constructor(
    @Inject(REPOSITORIES) private readonly repos: Repositories,
    @Inject(FILE_STORE) private readonly files: FileStore,
  ) {}

  async importFiles(userId: string, uploads: readonly UploadedFile[]): Promise<ImportResultDto[]> {
    const results: ImportResultDto[] = [];
    // One by one: a later file in the same batch must see the activities of the earlier ones.
    for (const upload of uploads) results.push(await this.importFile(userId, upload));
    return results;
  }

  async importFile(userId: string, upload: UploadedFile): Promise<ImportResultDto> {
    const fileName = cleanName(upload.fileName);
    const sha256 = createHash("sha256").update(upload.bytes).digest("hex");
    const base = {
      userId,
      sha256,
      fileName,
      sizeBytes: upload.bytes.length,
      storageKey: null,
    };
    const empty = {
      fileName,
      activityId: null,
      activityName: null,
      activityType: null,
      calendarDate: null,
      mergedWith: null,
      error: null,
    } satisfies Omit<ImportResultDto, "status">;

    const sameFile = await this.repos.activityFiles.importedActivityFor(userId, sha256);
    if (sameFile) {
      await this.repos.activityFiles.record({
        ...base,
        format: null,
        status: "duplicate",
        activityId: sameFile,
        errorCode: null,
      });
      return { ...empty, ...(await this.describe(userId, sameFile)), status: "duplicate" };
    }

    let parsed: ImportedActivity;
    try {
      parsed = parseActivityFile(upload.bytes);
    } catch (err) {
      const code = err instanceof ImportError ? err.code : "corrupt";
      if (!(err instanceof ImportError)) this.log.warn(`Unexpected import failure: ${String(err)}`);
      await this.repos.activityFiles.record({
        ...base,
        format: null,
        status: "failed",
        activityId: null,
        errorCode: code,
      });
      return { ...empty, status: "failed", error: code };
    }

    const outcome = importOutcome(
      parsed,
      await this.repos.activities.startingNear(userId, parsed.startTimeInSeconds),
    );
    if (outcome.kind === "duplicate") {
      await this.repos.activityFiles.record({
        ...base,
        format: parsed.format,
        status: "duplicate",
        activityId: outcome.activity.id,
        errorCode: null,
      });
      return { ...empty, ...summaryOf(outcome.activity), status: "duplicate" };
    }

    const activity = await this.ingest(userId, parsed, {
      vendor: "manual",
      // Per athlete: two athletes may upload the same shared file.
      externalId: `${userId}:${sha256}`,
      raw: { format: parsed.format, fileName },
    });
    const storageKey = `${userId}/${sha256}.${parsed.format}`;
    await this.files.put(storageKey, upload.bytes);
    await this.repos.activityFiles.record({
      ...base,
      storageKey,
      format: parsed.format,
      status: "imported",
      activityId: activity.id,
      errorCode: null,
    });

    return outcome.kind === "merged"
      ? {
          ...empty,
          ...summaryOf(outcome.activity),
          status: "merged",
          mergedWith: outcome.activity.source.vendor,
        }
      : { ...empty, ...summaryOf(activity), status: "imported" };
  }

  /**
   * Stores a parsed activity from any source (an uploaded file, a vendor's FIT) with its details.
   * The same source record again updates it (vendor + external id). Sources of one workout are
   * merged when shown, by the athlete's priority.
   */
  async ingest(
    userId: string,
    parsed: ImportedActivity,
    source: { vendor: Vendor; externalId: string; raw?: unknown },
  ): Promise<Activity> {
    const settings = await this.repos.settings.get(userId);
    const offset =
      parsed.startTimeOffsetInSeconds ??
      zoneOffsetSeconds(settings.timeZone, parsed.startTimeInSeconds);
    const calendarDate = localDateOf(
      new Date((parsed.startTimeInSeconds + offset) * 1000).toISOString(),
      "UTC",
    );
    const { t } = createTranslator(negotiateLocale({ userPreference: settings.locale }));
    const { activity } = await this.repos.activities.upsert({
      userId,
      vendor: source.vendor,
      externalId: source.externalId,
      activityName: parsed.activityName ?? t(`activityType.${parsed.activityType}`),
      activityType: parsed.activityType,
      calendarDate,
      startTimeInSeconds: parsed.startTimeInSeconds,
      startTimeOffsetInSeconds: offset,
      durationInSeconds: parsed.durationInSeconds,
      movingDurationInSeconds: parsed.movingDurationInSeconds,
      distanceInMeters: parsed.distanceInMeters,
      totalElevationGainInMeters: parsed.totalElevationGainInMeters,
      trainingLoad: parsed.trainingLoad,
      averageHeartRateInBeatsPerMinute: parsed.averageHeartRateInBeatsPerMinute,
      maxHeartRateInBeatsPerMinute: parsed.maxHeartRateInBeatsPerMinute,
      averagePowerInWatts: parsed.averagePowerInWatts,
      activeKilocalories: parsed.activeKilocalories,
      gearName: null,
      isRace: false,
      raw: source.raw ?? null,
    });
    const track = trackOf(parsed.streams);
    await this.repos.activityFiles.putDetail(activity.id, {
      laps: parsed.laps,
      streams: parsed.streams,
      route: track.length > 1 ? simplifyRoute(track) : null,
      device: parsed.device,
      exercises: parsed.exercises,
    });
    // Rated on the watch: the rating comes with the file, so the athlete is not asked again.
    if (parsed.rating) await this.repos.feedback.fromDevice(userId, activity.id, parsed.rating);
    return activity;
  }

  async summary(userId: string): Promise<ImportsSummaryDto> {
    const [summary, recent] = await Promise.all([
      this.repos.activityFiles.summary(userId),
      this.repos.activityFiles.list(userId, 10),
    ]);
    return {
      imported: summary.imported,
      lastImportAt: summary.lastImportAt?.toISOString() ?? null,
      recent: recent.map((f) => ({
        fileName: f.fileName,
        status: f.status,
        error: f.errorCode,
        createdAt: f.createdAt.toISOString(),
      })),
    };
  }

  /** Removes the kept originals of a user (account deletion). */
  async deleteOriginals(userId: string): Promise<void> {
    await this.files.delete(await this.repos.activityFiles.storageKeys(userId));
  }

  private async describe(userId: string, activityId: string) {
    return summaryOf(await this.repos.activities.get(userId, activityId));
  }
}

const summaryOf = (a: Activity) => ({
  activityId: a.id,
  activityName: a.activityName,
  activityType: a.activityType,
  calendarDate: a.calendarDate,
});

/** The file's base name without path or control characters, at most 200 characters. */
export function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (clean || "activity").slice(0, 200);
}
