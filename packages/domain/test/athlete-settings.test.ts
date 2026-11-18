import { describe, expect, it } from "vitest";
import {
  DEFAULT_ATHLETE_SETTINGS,
  resolveHrZones,
  zoneSourcePreference,
  type AthleteSettings,
} from "../src/athlete-settings.js";
import { zonesFromLowerBounds } from "../src/hr-zones.js";
import { defaultProfile } from "./fixtures.js";

const settings = (patch: Partial<AthleteSettings> = {}): AthleteSettings => ({
  ...DEFAULT_ATHLETE_SETTINGS,
  ...patch,
});

const manual = defaultProfile(); // source: manual, Easy ≤139 …
const garmin = defaultProfile({
  id: "g1",
  source: "garmin",
  zones: zonesFromLowerBounds([0, 120, 140, 155, 170]),
});
const polar = defaultProfile({
  id: "p1",
  source: "polar",
  zones: zonesFromLowerBounds([0, 125, 145, 160, 175]),
});

describe("zone source preference (profile setting)", () => {
  it("defaults to the data sources in priority order, manual last", () => {
    const pref = zoneSourcePreference(settings());
    expect(pref[0]).toBe("garmin");
    expect(pref.at(-1)).toBe("manual");
    expect(pref.filter((v) => v === "manual")).toHaveLength(1);
  });

  it("follows the athlete's own source priority", () => {
    expect(zoneSourcePreference(settings({ sourcePriority: ["polar", "garmin"] }))).toEqual([
      "polar",
      "garmin",
      "manual",
    ]);
  });

  it("can pin a vendor or prefer manual zones", () => {
    const s = { sourcePriority: ["garmin", "polar", "manual"] as const };
    expect(
      zoneSourcePreference(settings({ ...s, hrZones: { mode: "vendor", vendor: "polar" } })),
    ).toEqual(["polar", "garmin", "manual"]);
    expect(zoneSourcePreference(settings({ ...s, hrZones: { mode: "manual" } }))).toEqual([
      "manual",
      "garmin",
      "polar",
    ]);
  });
});

describe("resolveHrZones", () => {
  it("uses the primary source's zones by default", () => {
    const r = resolveHrZones([manual, polar, garmin], "2026-11-18", settings());
    expect(r).toMatchObject({ origin: "vendor", profile: { id: "g1" }, fellBack: false });
    expect(r?.zones[0]?.name).toBe("Warm Up");
  });

  it("falls to the next source, then to manual zones", () => {
    expect(resolveHrZones([manual, polar], "2026-11-18", settings())?.profile?.id).toBe("p1");
    expect(resolveHrZones([manual], "2026-11-18", settings())).toMatchObject({
      origin: "manual",
      fellBack: false,
    });
  });

  it("respects the profile setting and reports a fallback", () => {
    expect(
      resolveHrZones([manual, garmin], "2026-11-18", settings({ hrZones: { mode: "manual" } })),
    ).toMatchObject({ origin: "manual", profile: { id: "hp1" }, fellBack: false });
    expect(
      resolveHrZones([garmin], "2026-11-18", settings({ hrZones: { mode: "manual" } })),
    ).toMatchObject({ origin: "vendor", fellBack: true });
    expect(
      resolveHrZones(
        [garmin, polar],
        "2026-11-18",
        settings({ hrZones: { mode: "vendor", vendor: "polar" } }),
      )?.profile?.id,
    ).toBe("p1");
  });

  it("uses Garmin default zones from max HR, then from age", () => {
    const fromMax = resolveHrZones([], "2026-11-18", settings({ maxHeartRate: 190 }));
    expect(fromMax).toMatchObject({ origin: "garmin_default", profile: null, fellBack: false });
    expect(fromMax?.zones[4]).toMatchObject({ name: "Maximum", minBpm: 171 });

    // Born 18.11.1984 → 42 on 18.11.2026 → max HR 178; one day earlier still 41 → 179.
    const age42 = resolveHrZones([], "2026-11-18", settings({ birthDate: "1984-11-18" }));
    const age41 = resolveHrZones([], "2026-11-17", settings({ birthDate: "1984-11-18" }));
    expect(age42?.zones[4]?.minBpm).toBe(Math.round(0.9 * 178));
    expect(age41?.zones[4]?.minBpm).toBe(Math.round(0.9 * 179));
    expect(
      resolveHrZones([], "2026-11-18", settings({ maxHeartRate: 190, hrZones: { mode: "manual" } }))
        ?.fellBack,
    ).toBe(true);
  });

  it("returns null when nothing is known yet", () => {
    expect(resolveHrZones([], "2026-11-18", settings())).toBeNull();
  });
});
