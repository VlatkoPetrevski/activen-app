import { describe, expect, it } from "vitest";
import { mergeActivities } from "../src/merge.js";
import { canDisplay, canUseForAi, SOURCE_POLICIES } from "../src/source-policy.js";
import { VENDORS } from "../src/types.js";
import { activity, t } from "./fixtures.js";

describe("source policies", () => {
  it("defines a policy for every vendor", () => {
    for (const v of VENDORS) expect(SOURCE_POLICIES[v].basis.length).toBeGreaterThan(0);
  });

  it("never shows Strava data to anyone but the owner and never feeds it to AI", () => {
    expect(canDisplay("strava", "owner")).toBe(true);
    expect(canDisplay("strava", "coach")).toBe(false);
    expect(canUseForAi("strava")).toBe(false);
    expect(canDisplay("manual", "coach")).toBe(true);
    expect(canUseForAi("polar")).toBe(true);
  });
});

describe("mergeActivities", () => {
  const garmin = activity({
    calendarDate: "2026-11-16",
    source: { vendor: "garmin", externalId: "g1" },
    activityName: "Skopje Running",
    startTimeInSeconds: t("2026-11-16T06:00:00Z"),
    durationInSeconds: 3_000,
    trainingLoad: null,
    gearName: null,
    averagePowerInWatts: 250,
  });
  const strava = activity({
    calendarDate: "2026-11-16",
    source: { vendor: "strava", externalId: "s1" },
    activityName: "Morning Run",
    startTimeInSeconds: t("2026-11-16T06:00:30Z"),
    durationInSeconds: 3_010,
    trainingLoad: 55,
    gearName: "Pegasus",
    averagePowerInWatts: null,
  });
  const otherRide = activity({
    calendarDate: "2026-11-16",
    source: { vendor: "strava", externalId: "s2" },
    activityType: "CYCLING",
    startTimeInSeconds: t("2026-11-16T06:01:00Z"),
  });

  it("merges the same workout using the priority order and fills missing fields", () => {
    const [merged, ride] = mergeActivities([strava, garmin, otherRide], {
      priority: ["garmin", "strava"],
    });
    expect(merged?.activity.id).toBe(garmin.id);
    expect(merged?.activity.activityName).toBe("Skopje Running");
    expect(merged?.activity.trainingLoad).toBe(55);
    expect(merged?.activity.gearName).toBe("Pegasus");
    expect(merged?.activity.averagePowerInWatts).toBe(250);
    expect(merged?.sources.map((s) => s.vendor)).toEqual(["garmin", "strava"]);
    expect(merged?.provenance).toMatchObject({
      trainingLoad: "strava",
      averagePowerInWatts: "garmin",
      averageHeartRateInBeatsPerMinute: "garmin",
    });
    expect(ride?.activity.id).toBe(otherRide.id); // different sport → not merged
  });

  it("respects a different priority", () => {
    const [merged] = mergeActivities([garmin, strava], { priority: ["strava"] });
    expect(merged?.activity.activityName).toBe("Morning Run");
    expect(merged?.provenance.averagePowerInWatts).toBe("garmin");
  });

  it("excludes restricted sources entirely from the coach view", () => {
    const result = mergeActivities([garmin, strava, otherRide], {
      priority: ["garmin", "strava"],
      audience: "coach",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.activity.trainingLoad).toBeNull();
    expect(result[0]?.activity.gearName).toBeNull();
    expect(Object.values(result[0]?.provenance ?? {})).not.toContain("strava");
  });

  it("excludes AI-restricted sources when preparing AI input", () => {
    const result = mergeActivities([strava, otherRide], { priority: [], forAi: true });
    expect(result).toEqual([]);
  });

  it("does not merge records too far apart in time or duration, or from the same vendor", () => {
    const late = { ...strava, id: "late", startTimeInSeconds: t("2026-11-16T06:10:00Z") };
    const longer = { ...strava, id: "longer", durationInSeconds: 6_000 };
    const sameVendor = {
      ...garmin,
      id: "dup",
      source: { vendor: "garmin" as const, externalId: "g2" },
    };
    expect(mergeActivities([garmin, late], { priority: [] })).toHaveLength(2);
    expect(mergeActivities([garmin, longer], { priority: [] })).toHaveLength(2);
    expect(mergeActivities([garmin, sameVendor], { priority: [] })).toHaveLength(2);
  });

  it("ignores deleted records and keeps the race flag from any source", () => {
    const deleted = { ...strava, id: "del", deleted: true };
    expect(mergeActivities([garmin, deleted], { priority: [] })[0]?.sources).toHaveLength(1);
    const raceOnStrava = { ...strava, isRace: true };
    expect(
      mergeActivities([garmin, raceOnStrava], { priority: ["garmin"] })[0]?.activity.isRace,
    ).toBe(true);
  });

  it("treats zero-duration records as the same workout when everything else matches", () => {
    const a = { ...garmin, id: "z1", durationInSeconds: 0 };
    const b = { ...strava, id: "z2", durationInSeconds: 0 };
    expect(mergeActivities([a, b], { priority: [] })).toHaveLength(1);
  });

  it("does not merge different athletes", () => {
    const other = { ...strava, athleteId: "ath2" };
    expect(mergeActivities([garmin, other], { priority: [] })).toHaveLength(2);
  });
});
