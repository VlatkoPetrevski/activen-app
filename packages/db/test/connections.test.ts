import { describe, expect, it } from "vitest";
import { createUser, useDatabase } from "./helpers.js";

const { repos } = useDatabase();

const polarRun = (userId: string, externalId: string) => ({
  userId,
  vendor: "polar" as const,
  externalId,
  activityName: "Run",
  activityType: "RUNNING" as const,
  calendarDate: "2026-11-18",
  startTimeInSeconds: 1_795_240_800,
  startTimeOffsetInSeconds: 3600,
  durationInSeconds: 1800,
  movingDurationInSeconds: null,
  distanceInMeters: 6000,
  totalElevationGainInMeters: null,
  trainingLoad: null,
  averageHeartRateInBeatsPerMinute: null,
  maxHeartRateInBeatsPerMinute: null,
  averagePowerInWatts: null,
  activeKilocalories: null,
  gearName: null,
  isRace: false,
});

describe("vendor connections", () => {
  it("connects, reconnects, finds by the vendor's user id and records syncs", async () => {
    const user = await createUser(repos());
    const token = new Uint8Array([1, 2, 3]);
    const first = await repos().connections.upsert({
      userId: user.id,
      vendor: "polar",
      externalUserId: "123",
      accessTokenEnc: token,
      tokenExpiresAt: null,
    });
    expect(first).toMatchObject({
      vendor: "polar",
      externalUserId: "123",
      status: "active",
      lastSyncAt: null,
    });
    expect(first.accessTokenEnc).toEqual(token);
    const again = await repos().connections.upsert({
      userId: user.id,
      vendor: "polar",
      externalUserId: "123",
      accessTokenEnc: new Uint8Array([9]),
      tokenExpiresAt: null,
    });
    expect(again.id).toBe(first.id);
    expect((await repos().connections.byExternalUser("polar", "123"))?.userId).toBe(user.id);
    expect(await repos().connections.byExternalUser("polar", "999")).toBeNull();

    await repos().connections.markSynced(first.id, "Polar answered 503");
    expect(await repos().connections.get(user.id, "polar")).toMatchObject({
      status: "error",
      lastError: "Polar answered 503",
    });
    await repos().connections.markSynced(first.id);
    const ok = await repos().connections.get(user.id, "polar");
    expect(ok).toMatchObject({ status: "active", lastError: null });
    expect(ok?.lastSyncAt).toBeInstanceOf(Date);
    expect(await repos().connections.list(user.id)).toHaveLength(1);
  });

  it("removes the connection with the vendor's activities, keeping uploaded files", async () => {
    const user = await createUser(repos());
    await repos().connections.upsert({
      userId: user.id,
      vendor: "polar",
      externalUserId: "77",
      accessTokenEnc: new Uint8Array([1]),
      tokenExpiresAt: null,
    });
    await repos().activities.upsert(polarRun(user.id, "p1"));
    await repos().activities.upsert(polarRun(user.id, "p2"));
    await repos().activities.upsert({ ...polarRun(user.id, `${user.id}:abc`), vendor: "manual" });
    expect(await repos().connections.remove(user.id, "polar")).toBe(2);
    expect(await repos().connections.get(user.id, "polar")).toBeNull();
    const left = await repos().activities.listByDateRange(user.id, "2026-11-18", "2026-11-18");
    expect(left.map((a) => a.source.vendor)).toEqual(["manual"]);
  });
});
