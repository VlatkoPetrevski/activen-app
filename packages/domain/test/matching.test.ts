import { describe, expect, it } from "vitest";
import { matchPlanToActivities } from "../src/matching.js";
import { activity, plan } from "./fixtures.js";

describe("matchPlanToActivities (spec §7, AC-05, AC-06)", () => {
  it("links the plan to the only Run on that date", () => {
    const p = plan({ date: "2026-11-16" });
    const run = activity({ localDate: "2026-11-16" });
    const ride = activity({ localDate: "2026-11-16", sportType: "Ride", distanceM: 40_000 });
    const [link] = matchPlanToActivities([p], [ride, run]);
    expect(link).toEqual({
      planEntryId: p.id,
      activityId: run.id,
      reason: "auto_single",
      warning: null,
    });
  });

  it("links the longest Run when several Runs exist", () => {
    const p = plan({ date: "2026-11-16" });
    const short = activity({ localDate: "2026-11-16", distanceM: 3_000 });
    const long = activity({ localDate: "2026-11-16", distanceM: 12_000 });
    const [link] = matchPlanToActivities([p], [short, long]);
    expect(link?.activityId).toBe(long.id);
    expect(link?.reason).toBe("auto_longest");
  });

  it("breaks distance ties by earlier start time", () => {
    const p = plan({ date: "2026-11-16" });
    const pm = activity({ localDate: "2026-11-16", startTime: "2026-11-16T17:00:00Z" });
    const am = activity({ localDate: "2026-11-16", startTime: "2026-11-16T06:00:00Z" });
    expect(matchPlanToActivities([p], [pm, am])[0]?.activityId).toBe(am.id);
  });

  it("never auto-links non-Run activities", () => {
    const p = plan({ date: "2026-11-16" });
    const ride = activity({ localDate: "2026-11-16", sportType: "Ride" });
    expect(matchPlanToActivities([p], [ride])[0]).toMatchObject({
      activityId: null,
      reason: "no_candidate",
    });
  });

  it("matches a plan that explicitly targets another sport to that sport", () => {
    const p = plan({ date: "2026-11-16", plannedSportType: "Ride" });
    const run = activity({ localDate: "2026-11-16" });
    const ride = activity({ localDate: "2026-11-16", sportType: "GravelRide" });
    expect(matchPlanToActivities([p], [run, ride])[0]?.activityId).toBe(ride.id);
  });

  it("ignores deleted activities and other dates", () => {
    const p = plan({ date: "2026-11-16" });
    const deleted = activity({ localDate: "2026-11-16", deleted: true });
    const other = activity({ localDate: "2026-11-17" });
    expect(matchPlanToActivities([p], [deleted, other])[0]?.reason).toBe("no_candidate");
  });

  it("never links rest days (PLAN-04)", () => {
    const rest = plan({ date: "2026-11-16", kind: "rest" });
    const run = activity({ localDate: "2026-11-16" });
    expect(matchPlanToActivities([rest], [run])[0]).toEqual({
      planEntryId: rest.id,
      activityId: null,
      reason: "rest_day",
      warning: null,
    });
    expect(
      matchPlanToActivities([rest], [run], [{ planEntryId: rest.id, activityId: run.id }])[0]
        ?.warning,
    ).toBe("OVERRIDE_ON_REST_DAY");
  });

  it("assigns AM/PM sessions to distinct Runs by sequence", () => {
    const am = plan({ date: "2026-11-16", sequence: 0 });
    const pm = plan({ date: "2026-11-16", sequence: 1 });
    const long = activity({ localDate: "2026-11-16", distanceM: 15_000 });
    const short = activity({ localDate: "2026-11-16", distanceM: 5_000 });
    const links = matchPlanToActivities([pm, am], [short, long]);
    expect(links.map((l) => l.planEntryId)).toEqual([pm.id, am.id]); // input order preserved
    expect(links[1]).toMatchObject({ activityId: long.id, reason: "auto_longest" });
    expect(links[0]).toMatchObject({ activityId: short.id, reason: "auto_single" });
  });

  describe("manual overrides (rule 5)", () => {
    it("lets the user pick any activity, even on another date", () => {
      const p = plan({ date: "2026-11-16" });
      const sameDay = activity({ localDate: "2026-11-16", distanceM: 15_000 });
      const nextDay = activity({ localDate: "2026-11-17", sportType: "Ride" });
      const [link] = matchPlanToActivities(
        [p],
        [sameDay, nextDay],
        [{ planEntryId: p.id, activityId: nextDay.id }],
      );
      expect(link).toMatchObject({ activityId: nextDay.id, reason: "manual", warning: null });
    });

    it("prevents automatic matching from taking a manually chosen activity", () => {
      const p1 = plan({ date: "2026-11-16", sequence: 0 });
      const p2 = plan({ date: "2026-11-16", sequence: 1 });
      const long = activity({ localDate: "2026-11-16", distanceM: 15_000 });
      const short = activity({ localDate: "2026-11-16", distanceM: 5_000 });
      const links = matchPlanToActivities(
        [p1, p2],
        [long, short],
        [{ planEntryId: p2.id, activityId: long.id }],
      );
      expect(links[0]?.activityId).toBe(short.id);
      expect(links[1]).toMatchObject({ activityId: long.id, reason: "manual" });
    });

    it("supports explicit unlinking", () => {
      const p = plan({ date: "2026-11-16" });
      const run = activity({ localDate: "2026-11-16" });
      expect(
        matchPlanToActivities([p], [run], [{ planEntryId: p.id, activityId: null }])[0],
      ).toMatchObject({ activityId: null, reason: "manual_unlinked" });
    });

    it("falls back to automatic matching with a warning when the target is gone", () => {
      const p = plan({ date: "2026-11-16" });
      const run = activity({ localDate: "2026-11-16" });
      const gone = activity({ localDate: "2026-11-16", deleted: true });
      const [link] = matchPlanToActivities(
        [p],
        [run, gone],
        [{ planEntryId: p.id, activityId: gone.id }],
      );
      expect(link).toMatchObject({
        activityId: run.id,
        reason: "auto_single",
        warning: "OVERRIDE_TARGET_MISSING",
      });
    });

    it("falls back with a warning when the target is already taken", () => {
      const p1 = plan({ date: "2026-11-16", sequence: 0 });
      const p2 = plan({ date: "2026-11-16", sequence: 1 });
      const run = activity({ localDate: "2026-11-16" });
      const links = matchPlanToActivities(
        [p1, p2],
        [run],
        [
          { planEntryId: p1.id, activityId: run.id },
          { planEntryId: p2.id, activityId: run.id },
        ],
      );
      expect(links[0]).toMatchObject({ activityId: run.id, reason: "manual" });
      expect(links[1]).toMatchObject({
        activityId: null,
        reason: "no_candidate",
        warning: "OVERRIDE_TARGET_TAKEN",
      });
    });
  });
});
