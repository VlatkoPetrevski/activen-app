import type { WellnessRecord } from "@activen/domain";
import { describe, expect, it } from "vitest";
import { createUser, useDatabase } from "./helpers.js";

const { repos } = useDatabase();

const empty = (calendarDate: string, source: WellnessRecord["source"]): WellnessRecord => ({
  calendarDate,
  source,
  sleepDurationInSeconds: null,
  sleepScore: null,
  sleepQuality: null,
  restingHeartRate: null,
  lastNightHrvMs: null,
  vendorReadiness: null,
});

describe("daily wellness", () => {
  it("stores one row per day and source, replaces on put and deletes an empty record", async () => {
    const u = await createUser(repos());
    const w = repos().wellness;
    await w.put(u.id, {
      ...empty("2026-11-20", "manual"),
      sleepDurationInSeconds: 25_200,
      restingHeartRate: 50,
    });
    await w.put(u.id, { ...empty("2026-11-20", "polar"), sleepScore: 78, lastNightHrvMs: 61.5 });
    await w.put(u.id, { ...empty("2026-11-20", "manual"), restingHeartRate: 49 });
    await expect(
      w.put(u.id, { ...empty("2026-11-20", "manual"), sleepQuality: 6 }),
    ).rejects.toThrow();
    const day = await w.range(u.id, "2026-11-20", "2026-11-20");
    expect(day).toHaveLength(2);
    expect(day).toEqual(
      expect.arrayContaining([
        { ...empty("2026-11-20", "polar"), sleepScore: 78, lastNightHrvMs: 61.5 },
        { ...empty("2026-11-20", "manual"), restingHeartRate: 49 },
      ]),
    );
    await w.put(u.id, empty("2026-11-20", "manual"));
    expect((await w.range(u.id, "2026-11-01", "2026-11-30")).map((r) => r.source)).toEqual([
      "polar",
    ]);
  });

  it("patch changes only the given fields of a source's row", async () => {
    const u = await createUser(repos());
    const w = repos().wellness;
    await w.patch(u.id, "2026-11-21", "polar", { sleepDurationInSeconds: 26_000, sleepScore: 80 });
    await w.patch(u.id, "2026-11-21", "polar", { lastNightHrvMs: 58, restingHeartRate: 47 });
    expect(await w.range(u.id, "2026-11-21", "2026-11-21")).toEqual([
      {
        ...empty("2026-11-21", "polar"),
        sleepDurationInSeconds: 26_000,
        sleepScore: 80,
        lastNightHrvMs: 58,
        restingHeartRate: 47,
      },
    ]);
  });

  it("rejects values out of range and is isolated per user", async () => {
    const [a, b] = [await createUser(repos()), await createUser(repos())];
    await expect(
      repos().wellness.put(a.id, { ...empty("2026-11-21", "manual"), restingHeartRate: 5 }),
    ).rejects.toThrow();
    await repos().wellness.put(a.id, { ...empty("2026-11-21", "manual"), restingHeartRate: 50 });
    expect(await repos().wellness.range(b.id, "2026-11-01", "2026-11-30")).toEqual([]);
  });

  it("disconnecting a vendor removes its wellness but keeps the athlete's own input", async () => {
    const u = await createUser(repos());
    await repos().connections.upsert({
      userId: u.id,
      vendor: "polar",
      externalUserId: "p-1",
      accessTokenEnc: new Uint8Array([1]),
      tokenExpiresAt: null,
    });
    await repos().wellness.put(u.id, { ...empty("2026-11-21", "polar"), sleepScore: 70 });
    await repos().wellness.put(u.id, { ...empty("2026-11-21", "manual"), restingHeartRate: 50 });
    await repos().connections.remove(u.id, "polar");
    expect(
      (await repos().wellness.range(u.id, "2026-11-21", "2026-11-21")).map((r) => r.source),
    ).toEqual(["manual"]);
    expect(await repos().wellness.removeSource(u.id, "manual")).toBe(1);
  });
});

describe("notifications", () => {
  it("claims a morning email once, and releases it for a retry", async () => {
    const u = await createUser(repos());
    const n = repos().notifications;
    expect(await n.claim(u.id, "briefing", "2026-11-21")).toBe(true);
    expect(await n.claim(u.id, "briefing", "2026-11-21")).toBe(false);
    expect(await n.claim(u.id, "briefing", "2026-11-22")).toBe(true);
    await n.release(u.id, "briefing", "2026-11-21");
    expect(await n.claim(u.id, "briefing", "2026-11-21")).toBe(true);
  });

  it("lists only athletes who turned the reminder on and have an email", async () => {
    const on = await createUser(repos());
    const off = await createUser(repos());
    const settings = await repos().settings.get(on.id);
    await repos().settings.save(on.id, {
      ...settings,
      briefingReminder: { enabled: true, time: "06:30" },
    });
    await repos().settings.save(off.id, settings);
    const list = await repos().notifications.briefingRecipients();
    expect(list.filter((r) => [on.id, off.id].includes(r.userId))).toEqual([
      expect.objectContaining({ userId: on.id, time: "06:30", timeZone: "Europe/Skopje" }),
    ]);
  });
});
