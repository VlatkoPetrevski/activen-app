import { describe, expect, it } from "vitest";
import type { SourceActivityInput } from "../src/repositories/activities.js";
import { createUser, useDatabase } from "./helpers.js";

const { repos } = useDatabase();

const upload = (
  userId: string,
  overrides: Partial<SourceActivityInput> = {},
): SourceActivityInput => ({
  userId,
  vendor: "manual",
  externalId: `${userId}:${Math.random()}`,
  activityName: "Run",
  activityType: "RUNNING",
  calendarDate: "2026-11-18",
  startTimeInSeconds: 1_795_240_800,
  startTimeOffsetInSeconds: 3600,
  durationInSeconds: 1890,
  movingDurationInSeconds: 1870,
  distanceInMeters: 6317.4,
  totalElevationGainInMeters: 31,
  trainingLoad: 142.4,
  averageHeartRateInBeatsPerMinute: 150,
  maxHeartRateInBeatsPerMinute: 172,
  averagePowerInWatts: 250,
  activeKilocalories: 640,
  gearName: null,
  isRace: false,
  ...overrides,
});

const detail = {
  laps: [
    {
      intensity: "warmup" as const,
      startOffsetInSeconds: 0,
      durationInSeconds: 600,
      movingDurationInSeconds: 600,
      distanceInMeters: 1800,
      averageHeartRateInBeatsPerMinute: 130,
      maxHeartRateInBeatsPerMinute: 134,
      averagePowerInWatts: null,
    },
  ],
  streams: { time: [0, 1], heartRate: [120, 121] },
  route: [
    [41.99, 21.42],
    [41.991, 21.421],
  ] as [number, number][],
  device: {
    manufacturer: "garmin",
    deviceName: "Forerunner 965",
    heartRateSensor: "chest_strap" as const,
    creator: null,
  },
  exercises: [],
};

describe("activity files and details", () => {
  it("recognises a file imported before while its activity exists", async () => {
    const user = await createUser(repos());
    const other = await createUser(repos(), "Ана");
    const { activity } = await repos().activities.upsert(upload(user.id));
    const base = {
      userId: user.id,
      sha256: "abc",
      format: "fit",
      fileName: "run.fit",
      sizeBytes: 1200,
      storageKey: `${user.id}/abc`,
      activityId: activity.id,
      errorCode: null,
    };
    await repos().activityFiles.record({ ...base, status: "imported" });
    expect(await repos().activityFiles.importedActivityFor(user.id, "abc")).toBe(activity.id);
    // Another athlete uploading the same bytes is not a duplicate of yours.
    expect(await repos().activityFiles.importedActivityFor(other.id, "abc")).toBeNull();
    // Failed and duplicate attempts are recorded but never count as imported.
    await repos().activityFiles.record({
      ...base,
      sha256: "bad",
      status: "failed",
      activityId: null,
      errorCode: "corrupt",
      storageKey: null,
    });
    expect(await repos().activityFiles.importedActivityFor(user.id, "bad")).toBeNull();
    // Once the activity is deleted, the same file may be imported again.
    await repos().activities.markDeleted("manual", activity.source.externalId);
    expect(await repos().activityFiles.importedActivityFor(user.id, "abc")).toBeNull();

    const summary = await repos().activityFiles.summary(user.id);
    expect(summary.imported).toBe(1);
    expect(summary.lastImportAt).toBeInstanceOf(Date);
    expect((await repos().activityFiles.summary(other.id)).imported).toBe(0);
    expect((await repos().activityFiles.list(user.id)).map((f) => f.status)).toEqual([
      "failed",
      "imported",
    ]);
    expect(await repos().activityFiles.storageKeys(user.id)).toEqual([`${user.id}/abc`]);
  });

  it("stores, replaces and removes details with their activity", async () => {
    const user = await createUser(repos());
    const { activity } = await repos().activities.upsert(upload(user.id));
    await repos().activityFiles.putDetail(activity.id, detail);
    expect(await repos().activityFiles.detail(activity.id)).toEqual(detail);
    await repos().activityFiles.putDetail(activity.id, { ...detail, route: null, laps: [] });
    expect(await repos().activityFiles.detail(activity.id)).toMatchObject({
      route: null,
      laps: [],
    });
    expect((await repos().activityFiles.details([])).size).toBe(0);
    await repos().users.deleteAccount(user.id);
    expect(await repos().activityFiles.detail(activity.id)).toBeNull();
  });

  it("finds activities that started near an instant", async () => {
    const user = await createUser(repos());
    const t = 1_795_240_800;
    await repos().activities.upsert(upload(user.id, { startTimeInSeconds: t - 120 }));
    await repos().activities.upsert(upload(user.id, { startTimeInSeconds: t + 7200 }));
    const near = await repos().activities.startingNear(user.id, t);
    expect(near.map((a) => a.startTimeInSeconds)).toEqual([t - 120]);
    expect(await repos().activities.startingNear(user.id, t, 10)).toEqual([]);
  });
});
