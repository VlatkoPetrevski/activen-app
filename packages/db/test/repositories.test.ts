import {
  DEFAULT_ATHLETE_SETTINGS,
  garminHeartRateZones,
  matchPlanToActivities,
} from "@activen/domain";
import { describe, expect, it } from "vitest";
import { ping } from "../src/client.js";
import { ConflictError, NotFoundError, ValidationError } from "../src/errors.js";
import type { SourceActivityInput } from "../src/repositories/activities.js";
import { createUser, useDatabase } from "./helpers.js";

const { database, repos } = useDatabase();

const run = (
  userId: string,
  overrides: Partial<SourceActivityInput> = {},
): SourceActivityInput => ({
  userId,
  vendor: "garmin",
  externalId: `g-${Math.random()}`,
  activityName: "Morning Run",
  activityType: "RUNNING",
  calendarDate: "2026-11-17",
  startTimeInSeconds: 1_763_362_800,
  startTimeOffsetInSeconds: 3600,
  durationInSeconds: 5384,
  movingDurationInSeconds: 5300,
  distanceInMeters: 16_522.2,
  totalElevationGainInMeters: 45,
  trainingLoad: 111,
  averageHeartRateInBeatsPerMinute: 159,
  maxHeartRateInBeatsPerMinute: 176,
  averagePowerInWatts: 442,
  activeKilocalories: 1312,
  gearName: "Adidas Adizero Boston 13",
  isRace: false,
  ...overrides,
});

describe("connection", () => {
  it("answers readiness pings", async () => {
    expect(await ping(database().pool)).toBe(true);
  });
});

describe("users", () => {
  it("creates a user on first sign-in and finds it again by provider subject", async () => {
    const input = {
      provider: "google" as const,
      subject: "google-123",
      email: "vlatko@example.com",
      displayName: "Влатко",
    };
    const first = await repos().users.findOrCreateByIdentity(input);
    expect(first.created).toBe(true);
    expect(first.user.roles).toEqual(["athlete"]);
    const second = await repos().users.findOrCreateByIdentity({ ...input, displayName: "Changed" });
    expect(second).toMatchObject({
      created: false,
      user: { id: first.user.id, displayName: "Влатко" },
    });
  });

  it("never links accounts by email alone", async () => {
    const a = await repos().users.findOrCreateByIdentity({
      provider: "google",
      subject: "g-1",
      email: "same@example.com",
      displayName: "A",
    });
    await expect(
      repos().users.findOrCreateByIdentity({
        provider: "apple",
        subject: "a-1",
        email: "SAME@example.com",
        displayName: "B",
      }),
    ).rejects.toThrow(); // unique email index (case-insensitive) blocks a silent second account
    expect((await repos().users.get(a.user.id)).email).toBe("same@example.com");
  });

  it("manages roles and reports missing users", async () => {
    const u = await createUser(repos(), "Ана", ["coach"]);
    await repos().users.addRole(u.id, "athlete");
    await repos().users.addRole(u.id, "athlete");
    expect(await repos().users.roles(u.id)).toEqual(["athlete", "coach"]);
    await expect(repos().users.get("00000000-0000-0000-0000-000000000000")).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("settings", () => {
  it("returns defaults until saved, then round-trips every field", async () => {
    const u = await createUser(repos());
    expect(await repos().settings.get(u.id)).toEqual(DEFAULT_ATHLETE_SETTINGS);
    const saved = await repos().settings.save(u.id, {
      locale: "en",
      unitSystem: "imperial",
      timeZone: "America/New_York",
      sourcePriority: ["polar", "garmin", "manual", "strava"],
      hrZones: { mode: "vendor", vendor: "polar" },
      maxHeartRate: 186,
      birthDate: "1984-03-09",
    });
    expect(await repos().settings.get(u.id)).toEqual(saved);
    await repos().settings.save(u.id, { ...saved, hrZones: { mode: "manual" } });
    expect((await repos().settings.get(u.id)).hrZones).toEqual({ mode: "manual" });
  });

  it("rejects invalid settings", async () => {
    const u = await createUser(repos());
    const base = {
      ...DEFAULT_ATHLETE_SETTINGS,
      sourcePriority: [...DEFAULT_ATHLETE_SETTINGS.sourcePriority],
    };
    await expect(
      repos().settings.save(u.id, { ...base, timeZone: "Mars/Olympus" }),
    ).rejects.toThrow(ValidationError);
    await expect(repos().settings.save(u.id, { ...base, maxHeartRate: 300 })).rejects.toThrow(
      ValidationError,
    );
    await expect(repos().settings.save(u.id, { ...base, birthDate: "1984-02-30" })).rejects.toThrow(
      ValidationError,
    );
    await expect(
      repos().settings.save(u.id, { ...base, sourcePriority: ["garmin", "garmin"] }),
    ).rejects.toThrow(ValidationError);
  });
});

describe("activities", () => {
  it("stores a vendor activity idempotently and maps it to the domain model", async () => {
    const u = await createUser(repos());
    const input = run(u.id, { externalId: "g-1", raw: { summaryId: "g-1" } });
    const first = await repos().activities.upsert(input);
    const again = await repos().activities.upsert({
      ...input,
      activityName: "Edited in Garmin Connect",
    });
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.activity.id).toBe(first.activity.id);
    const list = await repos().activities.listByDateRange(u.id, "2026-11-16", "2026-11-22");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      activityName: "Edited in Garmin Connect",
      activityType: "RUNNING",
      source: { vendor: "garmin", externalId: "g-1" },
      distanceInMeters: 16_522.2,
      athleteId: u.id,
      deleted: false,
    });
  });

  it("soft-deletes on vendor deletion and restores when re-sent", async () => {
    const u = await createUser(repos());
    const input = run(u.id, { externalId: "g-del" });
    await repos().activities.upsert(input);
    expect(await repos().activities.markDeleted("garmin", "g-del")).toBe(true);
    expect(await repos().activities.markDeleted("garmin", "nope")).toBe(false);
    expect(await repos().activities.listByDateRange(u.id, "2026-11-01", "2026-11-30")).toEqual([]);
    expect(
      await repos().activities.listByDateRange(u.id, "2026-11-01", "2026-11-30", {
        includeDeleted: true,
      }),
    ).toHaveLength(1);
    await repos().activities.upsert(input);
    expect(await repos().activities.listByDateRange(u.id, "2026-11-01", "2026-11-30")).toHaveLength(
      1,
    );
  });

  it("maps unknown stored activity types to OTHER and filters by athlete and dates", async () => {
    const u = await createUser(repos());
    const other = await createUser(repos(), "Друг");
    await repos().activities.upsert(run(u.id, { calendarDate: "2026-11-30" }));
    await repos().activities.upsert(run(other.id));
    await database().pool.query("update source_activities set activity_type = 'KITESURFING'");
    const list = await repos().activities.listByDateRange(u.id, "2026-11-30", "2026-11-30");
    expect(list.map((a) => a.activityType)).toEqual(["OTHER"]);
  });
});

describe("HR zone profiles", () => {
  it("adds immutable versions per source", async () => {
    const u = await createUser(repos());
    const zones = garminHeartRateZones(190);
    const v1 = await repos().hrZones.addVersion({
      userId: u.id,
      source: "garmin",
      name: "Garmin",
      effectiveFrom: "2026-01-01",
      zones,
    });
    const [v2, p1] = await Promise.all([
      repos().hrZones.addVersion({
        userId: u.id,
        source: "garmin",
        name: "Garmin",
        effectiveFrom: "2026-06-01",
        zones,
      }),
      repos().hrZones.addVersion({
        userId: u.id,
        source: "polar",
        name: "Polar",
        effectiveFrom: "2026-03-01",
        zones,
      }),
    ]);
    expect([v1.version, v2.version, p1.version]).toEqual([1, 2, 1]);
    const list = await repos().hrZones.list(u.id);
    expect(list.map((p) => [p.source, p.version])).toEqual([
      ["garmin", 1],
      ["polar", 1],
      ["garmin", 2],
    ]);
    expect(list[0]?.zones[0]?.name).toBe("Warm Up");
  });

  it("rejects invalid zones and dates", async () => {
    const u = await createUser(repos());
    await expect(
      repos().hrZones.addVersion({
        userId: u.id,
        source: "manual",
        name: "x",
        effectiveFrom: "2026-01-01",
        zones: [],
      }),
    ).rejects.toThrow(ValidationError);
    await expect(
      repos().hrZones.addVersion({
        userId: u.id,
        source: "manual",
        name: "x",
        effectiveFrom: "2026-13-01",
        zones: garminHeartRateZones(190),
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe("plans", () => {
  const entry = {
    calendarDate: "2026-11-19",
    kind: "workout" as const,
    description: "14 km со 6 × 1000 м на 5K темпо",
    plannedActivityType: "RUNNING" as const,
    plannedDistanceInMeters: 14_000,
    plannedDurationInSeconds: 4500,
    notes: null,
    sequence: 0,
    language: "mk",
  };

  it("creates, updates with history, and lists by date", async () => {
    const athlete = await createUser(repos());
    const coach = await createUser(repos(), "Ана", ["coach"]);
    const created = await repos().plans.create(athlete.id, entry, coach.id);
    expect(created).toMatchObject({ version: 1, language: "mk", plannedActivityType: "RUNNING" });
    const updated = await repos().plans.update(
      created.id,
      { description: "12 km лесно" },
      1,
      coach.id,
    );
    expect(updated).toMatchObject({
      version: 2,
      description: "12 km лесно",
      calendarDate: "2026-11-19",
    });
    const history = await repos().plans.history(created.id);
    expect(
      history.map((h) => [h.version, (h.snapshot as { description: string }).description]),
    ).toEqual([
      [1, entry.description],
      [2, "12 km лесно"],
    ]);
    expect(
      await repos().plans.listByDateRange(athlete.id, "2026-11-16", "2026-11-22"),
    ).toHaveLength(1);
  });

  it("detects concurrent edits and missing entries", async () => {
    const athlete = await createUser(repos());
    const created = await repos().plans.create(athlete.id, entry, athlete.id);
    await repos().plans.update(created.id, { notes: "athlete edit" }, 1, athlete.id);
    await expect(
      repos().plans.update(created.id, { notes: "coach edit" }, 1, athlete.id),
    ).rejects.toThrow(ConflictError);
    await repos().plans.remove(created.id);
    await expect(repos().plans.update(created.id, { notes: "x" }, 2, athlete.id)).rejects.toThrow(
      NotFoundError,
    );
    await expect(repos().plans.remove(created.id)).rejects.toThrow(NotFoundError);
    expect(await repos().plans.listByDateRange(athlete.id, "2026-11-01", "2026-11-30")).toEqual([]);
  });

  it("validates entries", async () => {
    const athlete = await createUser(repos());
    for (const bad of [
      { calendarDate: "19.11.2026" },
      { plannedActivityType: "Run" as never },
      { description: "  " },
      { plannedDistanceInMeters: -1 },
    ])
      await expect(
        repos().plans.create(athlete.id, { ...entry, ...bad }, athlete.id),
      ).rejects.toThrow(ValidationError);
  });

  it("stores manual link overrides that feed the domain matcher", async () => {
    const athlete = await createUser(repos());
    const plan = await repos().plans.create(athlete.id, entry, athlete.id);
    const { activity: long } = await repos().activities.upsert(
      run(athlete.id, { calendarDate: "2026-11-19", distanceInMeters: 14_200 }),
    );
    const { activity: short } = await repos().activities.upsert(
      run(athlete.id, { calendarDate: "2026-11-19", distanceInMeters: 3_000 }),
    );
    await repos().plans.setOverride(plan.id, short.id, athlete.id);
    let overrides = await repos().plans.overridesFor([plan.id]);
    expect(matchPlanToActivities([plan], [long, short], overrides)[0]).toMatchObject({
      activityId: short.id,
      reason: "manual",
    });
    await repos().plans.setOverride(plan.id, null, athlete.id);
    overrides = await repos().plans.overridesFor([plan.id]);
    expect(overrides).toEqual([{ planEntryId: plan.id, activityId: null }]);
    await repos().plans.clearOverride(plan.id);
    expect(await repos().plans.overridesFor([plan.id])).toEqual([]);
    expect(await repos().plans.overridesFor([])).toEqual([]);
    expect(matchPlanToActivities([plan], [long, short], [])[0]?.activityId).toBe(long.id);
  });
});

describe("activity feedback", () => {
  it("saves and replaces the athlete's check-in", async () => {
    const u = await createUser(repos());
    const { activity } = await repos().activities.upsert(run(u.id));
    const fb = await repos().feedback.upsert(u.id, activity.id, {
      perceivedEffort: 7,
      feel: 3,
      comment: "  левото колено  ",
      language: "mk",
    });
    expect(fb).toMatchObject({ perceivedEffort: 7, feel: 3, comment: "левото колено" });
    const again = await repos().feedback.upsert(u.id, activity.id, {
      perceivedEffort: 8,
      feel: null,
      comment: "",
      language: null,
    });
    expect(again).toMatchObject({ perceivedEffort: 8, feel: null, comment: null });
  });

  it("validates ranges and ownership", async () => {
    const u = await createUser(repos());
    const other = await createUser(repos(), "Друг");
    const { activity } = await repos().activities.upsert(run(u.id));
    const ok = { perceivedEffort: 5, feel: 3, comment: null, language: null };
    await expect(
      repos().feedback.upsert(u.id, activity.id, { ...ok, perceivedEffort: 11 }),
    ).rejects.toThrow(ValidationError);
    await expect(repos().feedback.upsert(u.id, activity.id, { ...ok, feel: 2.5 })).rejects.toThrow(
      ValidationError,
    );
    await expect(
      repos().feedback.upsert(u.id, activity.id, { ...ok, comment: "x".repeat(2001) }),
    ).rejects.toThrow(ValidationError);
    await expect(repos().feedback.upsert(other.id, activity.id, ok)).rejects.toThrow(NotFoundError);
  });
});

describe("sync events", () => {
  const event = {
    vendor: "polar" as const,
    objectId: "ex-1",
    aspect: "create",
    eventTime: new Date("2026-11-19T07:00:00Z"),
  };

  it("ignores duplicate deliveries", async () => {
    const first = await repos().syncEvents.record({ ...event, payload: { url: "x" } });
    const dup = await repos().syncEvents.record(event);
    expect(first.duplicate).toBe(false);
    expect(dup).toEqual({ id: null, duplicate: true });
  });

  it("lets parallel workers claim disjoint events and retries failures", async () => {
    for (let i = 0; i < 6; i++) await repos().syncEvents.record({ ...event, objectId: `ex-${i}` });
    const [a, b] = await Promise.all([
      repos().syncEvents.claimPending(3),
      repos().syncEvents.claimPending(3),
    ]);
    const ids = [...(a ?? []), ...(b ?? [])].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const first = a?.[0];
    expect(first?.attempts).toBe(1);
    await repos().syncEvents.markProcessed(first!.id);
    const second = a?.[1];
    expect(await repos().syncEvents.markFailed(second!.id, "timeout", 2)).toBe("pending");
    const [retried] = (await repos().syncEvents.claimPending(10)).filter(
      (e) => e.id === second!.id,
    );
    expect(retried?.attempts).toBe(2);
    expect(await repos().syncEvents.markFailed(second!.id, "timeout again", 2)).toBe("failed");
  });
});

describe("sync event leases", () => {
  it("does not hand out claimed events again until the lease expires", async () => {
    await repos().syncEvents.record({
      vendor: "garmin",
      objectId: "a-1",
      aspect: "create",
      eventTime: new Date(),
    });
    const [claimed] = await repos().syncEvents.claimPending(5);
    expect(claimed?.status).toBe("processing");
    expect(await repos().syncEvents.claimPending(5)).toEqual([]);
    await database().pool.query(
      "update sync_events set claimed_at = now() - interval '20 minutes'",
    );
    const [reclaimed] = await repos().syncEvents.claimPending(5, 600);
    expect(reclaimed).toMatchObject({ id: claimed?.id, attempts: 2 });
  });
});

describe("coaching and consent", () => {
  it("links coach and athlete with per-scope consent and audits reads", async () => {
    const coach = await createUser(repos(), "Ана", ["coach"]);
    const athlete = await createUser(repos());
    const link = await repos().coaching.invite(coach.id, athlete.id);
    await expect(repos().coaching.invite(coach.id, athlete.id)).rejects.toThrow(ConflictError);
    expect(await repos().coaching.scopes(coach.id, athlete.id)).toEqual([]);

    await repos().coaching.accept(link.id, athlete.id, ["activities", "comments", "activities"]);
    expect(await repos().coaching.scopes(coach.id, athlete.id)).toEqual(["activities", "comments"]);
    expect((await repos().coaching.athletesOf(coach.id)).map((l) => l.athleteId)).toEqual([
      athlete.id,
    ]);

    expect(await repos().coaching.authorizeCoachRead(coach.id, athlete.id, "activities")).toBe(
      true,
    );
    expect(await repos().coaching.authorizeCoachRead(coach.id, athlete.id, "sleep_recovery")).toBe(
      false,
    );
    const audit = await database().pool.query("select action, details from audit_log");
    expect(audit.rows).toEqual([{ action: "coach.read", details: { scope: "activities" } }]);

    await repos().coaching.grant(link.id, "sleep_recovery");
    await repos().coaching.grant(link.id, "sleep_recovery");
    await repos().coaching.revoke(link.id, "comments");
    expect(await repos().coaching.scopes(coach.id, athlete.id)).toEqual([
      "activities",
      "sleep_recovery",
    ]);

    await repos().coaching.end(link.id);
    expect(await repos().coaching.scopes(coach.id, athlete.id)).toEqual([]);
    // After ending, a new invitation is possible.
    expect((await repos().coaching.invite(coach.id, athlete.id)).status).toBe("invited");
  });

  it("rejects self-coaching and foreign acceptance", async () => {
    const coach = await createUser(repos(), "Ана", ["coach"]);
    const athlete = await createUser(repos());
    const stranger = await createUser(repos(), "Друг");
    await expect(repos().coaching.invite(coach.id, coach.id)).rejects.toThrow(ValidationError);
    const link = await repos().coaching.invite(coach.id, athlete.id);
    await expect(repos().coaching.accept(link.id, stranger.id, ["activities"])).rejects.toThrow(
      NotFoundError,
    );
  });
});
