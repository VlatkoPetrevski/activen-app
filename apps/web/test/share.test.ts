import type { ActivityDetailDto } from "@activen/contracts";
import { buildDemoExercises, buildDemoLaps, buildDemoRoute } from "@activen/contracts";
import { createFormatter, createTranslator } from "@activen/i18n";
import { describe, expect, it } from "vitest";
import {
  availableStats,
  availableTemplates,
  defaultStats,
  defaultTemplate,
  figureFor,
  fitRoute,
  MAX_STATS,
  shareFileName,
  toggleStat,
  trimRoute,
} from "../src/share/model.js";
import { renderCard } from "../src/share/render.js";

const translator = createTranslator("mk");
const t = translator.t as Parameters<typeof availableStats>[2];
const f = createFormatter(translator);

function detail(
  over: Partial<ActivityDetailDto["activity"]> = {},
  plan: string | null = null,
): ActivityDetailDto {
  const activity = {
    id: "a1",
    athleteId: "u",
    source: { vendor: "garmin" as const, externalId: "x" },
    activityName: "Скопје — трчање",
    activityType: "RUNNING" as const,
    calendarDate: "2026-11-17",
    startTimeInSeconds: 1_795_000_000,
    startTimeOffsetInSeconds: 3600,
    distanceInMeters: 12_000,
    durationInSeconds: 3600,
    movingDurationInSeconds: 3550,
    totalElevationGainInMeters: 60,
    trainingLoad: 143,
    averageHeartRateInBeatsPerMinute: 160,
    maxHeartRateInBeatsPerMinute: 176,
    averagePowerInWatts: null,
    activeKilocalories: 800,
    gearName: null,
    isRace: false,
    deleted: false,
    feedback: null,
    ...over,
  };
  const outdoors = (activity.distanceInMeters ?? 0) > 0;
  return {
    activity,
    laps: buildDemoLaps(activity, plan),
    exercises: activity.activityType === "STRENGTH_TRAINING" ? buildDemoExercises(1) : [],
    device: {
      vendor: "garmin",
      deviceName: null,
      heartRateSensor: null,
      heartRateSensorName: null,
    },
    route: outdoors ? buildDemoRoute(activity.distanceInMeters ?? 0, 3) : null,
    planEntry: null,
    comments: [],
    insights: [],
  };
}

describe("share model", () => {
  it("offers the numbers an activity has, with sport-specific defaults", () => {
    const run = detail({}, "12 km фартлек 10 × 1 мин брзо / 1 мин лесно");
    const keys = availableStats(run, f, t).map((s) => s.key);
    expect(keys).toEqual(
      expect.arrayContaining(["distance", "time", "pace", "avgHr", "intervals"]),
    );
    expect(keys).not.toContain("speed");
    expect(defaultStats(run)).toEqual(["distance", "pace", "intervals", "time"]);
    expect(availableStats(run, f, t).find((s) => s.key === "pace")?.value).toBe("5:00 /km");

    const ride = detail({ activityType: "CYCLING", distanceInMeters: 27_000 });
    expect(availableStats(ride, f, t).map((s) => s.key)).toContain("speed");
    expect(defaultStats(ride)).toEqual(["distance", "speed", "elevation", "time"]);

    const gym = detail({
      activityType: "STRENGTH_TRAINING",
      distanceInMeters: null,
      totalElevationGainInMeters: null,
    });
    const gymStats = availableStats(gym, f, t);
    expect(gymStats.find((s) => s.key === "exercises")?.value).toBe("6");
    expect(gymStats.find((s) => s.key === "sets")?.value).toBe("18");
    expect(gymStats.map((s) => s.key)).not.toContain("distance");
    expect(defaultStats(gym)).toEqual(["time", "exercises", "sets", "avgHr"]);
  });

  it("picks templates and figures by what the activity has", () => {
    const run = detail({}, "12 km фартлек 10 × 1 мин брзо / 1 мин лесно");
    expect(availableTemplates(run)).toEqual(["photo", "route", "figure", "intervals", "bold"]);
    expect(defaultTemplate(run)).toBe("route");
    const gym = detail({ activityType: "STRENGTH_TRAINING", distanceInMeters: null });
    expect(availableTemplates(gym)).toEqual(["photo", "figure", "bold"]);
    expect(defaultTemplate(gym)).toBe("figure");
    expect(
      ["RUNNING", "CYCLING", "STRENGTH_TRAINING", "LAP_SWIMMING", "WALKING"].map(figureFor),
    ).toEqual(["runner", "cyclist", "lifter", "swimmer", "walker"]);
  });

  it("toggles numbers in display order, up to the maximum", () => {
    const all = ["distance", "time", "pace", "elevation", "avgHr"] as const;
    let sel = toggleStat([], "pace", [...all]);
    sel = toggleStat(sel, "distance", [...all]);
    expect(sel).toEqual(["distance", "pace"]);
    sel = toggleStat(toggleStat(sel, "time", [...all]), "avgHr", [...all]);
    expect(sel).toHaveLength(MAX_STATS);
    expect(toggleStat(sel, "elevation", [...all])).toEqual(sel);
    expect(toggleStat(sel, "pace", [...all])).toEqual(["distance", "time", "avgHr"]);
  });

  it("hides the start and end of a route and fits it in a box", () => {
    const pts = buildDemoRoute(10_000, 3).points as [number, number][];
    const trimmed = trimRoute(pts, 200);
    expect(trimmed.length).toBeLessThan(pts.length);
    expect(trimmed[0]).not.toEqual(pts[0]);
    expect(trimRoute(pts, 0)).toBe(pts);
    const short: [number, number][] = [
      [42, 21.4],
      [42.0001, 21.4],
      [42.0002, 21.4],
    ];
    expect(trimRoute(short, 200).length).toBeGreaterThan(0);
    const box = { x: 100, y: 50, width: 800, height: 600 };
    const xy = fitRoute(pts, box);
    for (const [x, y] of xy) {
      expect(x).toBeGreaterThanOrEqual(box.x - 0.01);
      expect(x).toBeLessThanOrEqual(box.x + box.width + 0.01);
      expect(y).toBeGreaterThanOrEqual(box.y - 0.01);
      expect(y).toBeLessThanOrEqual(box.y + box.height + 0.01);
    }
    expect(fitRoute([], box)).toEqual([]);
  });

  it("names the file after the date and the activity", () => {
    expect(shareFileName(detail())).toBe("activen-2026-11-17-скопје-трчање.png");
  });

  it("does not throw where the canvas cannot draw", () => {
    const canvas = document.createElement("canvas");
    const ok = renderCard(canvas, {
      format: "square",
      template: "route",
      theme: "ember",
      photo: null,
      photoSize: null,
      photoRoute: false,
      title: "x",
      subtitle: "y",
      stats: [],
      route: null,
      laps: [],
      figure: "runner",
    });
    expect(ok).toBe(false);
    expect([canvas.width, canvas.height]).toEqual([1080, 1080]);
  });
});
