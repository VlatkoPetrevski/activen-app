import { describe, expect, it } from "vitest";
import { buildDemoLaps, demoDevice, lapBreakdown, type ActivityLapDto } from "../src/index.js";

const run = {
  activityType: "RUNNING",
  distanceInMeters: 12_100,
  durationInSeconds: 3590,
  averageHeartRateInBeatsPerMinute: 158,
  maxHeartRateInBeatsPerMinute: 181,
  startTimeInSeconds: 1_795_000_000,
};
const sum = (laps: ActivityLapDto[], k: "durationInSeconds" | "distanceInMeters") =>
  laps.reduce((s, l) => s + (l[k] ?? 0), 0);

describe("buildDemoLaps", () => {
  it("builds warm-up, intervals, recoveries and cool-down from the plan text", () => {
    const laps = buildDemoLaps(run, "12 km фартлек 10 × 1 мин брзо / 1 мин лесно");
    const kinds = laps.map((l) => l.intensity);
    expect(kinds[0]).toBe("warmup");
    expect(kinds.at(-1)).toBe("cooldown");
    expect(kinds.filter((k) => k === "active")).toHaveLength(10);
    expect(kinds.filter((k) => k === "recovery")).toHaveLength(9);
    // Laps add up exactly to the recorded activity.
    expect(sum(laps, "durationInSeconds")).toBe(run.durationInSeconds);
    expect(sum(laps, "distanceInMeters")).toBe(run.distanceInMeters);
    // Intervals are faster and harder than recoveries; the max HR is reached once.
    const pace = (l: ActivityLapDto) => l.durationInSeconds / (l.distanceInMeters ?? 1);
    const first = laps[1] as ActivityLapDto;
    const rec = laps[2] as ActivityLapDto;
    expect(pace(first)).toBeLessThan(pace(rec));
    expect(first.averageHeartRateInBeatsPerMinute ?? 0).toBeGreaterThan(
      rec.averageHeartRateInBeatsPerMinute ?? 0,
    );
    expect(Math.max(...laps.map((l) => l.maxHeartRateInBeatsPerMinute ?? 0))).toBe(181);
    expect(laps.map((l) => l.index)).toEqual(laps.map((_, i) => i + 1));
  });

  it("parses distance reps and falls back to auto-laps", () => {
    const reps = buildDemoLaps(run, "14 km with 6 × 1000 m at 5K pace");
    expect(reps.filter((l) => l.intensity === "active")).toHaveLength(6);
    const tempo = buildDemoLaps(run, "15 km со 3 × 3 km на маратонско темпо");
    expect(tempo.filter((l) => l.intensity === "active")).toHaveLength(3);
    const easy = buildDemoLaps(run, "10 km лесно (Zone 2)");
    expect(easy).toHaveLength(13);
    expect(easy.every((l) => l.intensity === "active")).toBe(true);
    const bike = buildDemoLaps({ ...run, activityType: "CYCLING", distanceInMeters: 27_000 }, null);
    expect(bike).toHaveLength(6);
    expect(buildDemoLaps({ ...run, activityType: "STRENGTH_TRAINING" }, null)).toEqual([]);
    expect(
      buildDemoLaps(
        { ...run, averageHeartRateInBeatsPerMinute: null, maxHeartRateInBeatsPerMinute: null },
        null,
      )[0]?.averageHeartRateInBeatsPerMinute,
    ).toBeNull();
  });

  it("names a device and heart-rate sensor", () => {
    expect(demoDevice({ activityType: "RUNNING", trainingLoad: 150 })).toMatchObject({
      deviceName: "Forerunner 965",
      heartRateSensor: "chest_strap",
    });
    expect(demoDevice({ activityType: "RUNNING", trainingLoad: 60 }).heartRateSensor).toBe(
      "optical",
    );
    expect(demoDevice({ activityType: "CYCLING", trainingLoad: 60 }).deviceName).toBe("Edge 840");
  });
});

describe("lapBreakdown", () => {
  it("totals each intensity in workout order with time-weighted heart rate", () => {
    const lap = (
      intensity: ActivityLapDto["intensity"],
      d: number,
      t: number,
      hr: number | null,
      max: number | null,
    ): ActivityLapDto => ({
      index: 0,
      intensity,
      startOffsetInSeconds: 0,
      durationInSeconds: t,
      distanceInMeters: d,
      averageHeartRateInBeatsPerMinute: hr,
      maxHeartRateInBeatsPerMinute: max,
    });
    const groups = lapBreakdown([
      lap("cooldown", 1000, 330, 140, 150),
      lap("warmup", 2000, 660, 135, 148),
      lap("active", 1000, 240, 170, 178),
      lap("active", 1000, 120, 160, 181),
      lap("recovery", 200, 90, null, null),
    ]);
    expect(groups.map((g) => g.intensity)).toEqual(["warmup", "active", "recovery", "cooldown"]);
    expect(groups[1]).toEqual({
      intensity: "active",
      count: 2,
      distanceInMeters: 2000,
      durationInSeconds: 360,
      averageHeartRateInBeatsPerMinute: 167,
      maxHeartRateInBeatsPerMinute: 181,
    });
    expect(groups[2]).toMatchObject({
      averageHeartRateInBeatsPerMinute: null,
      maxHeartRateInBeatsPerMinute: null,
    });
    expect(lapBreakdown([])).toEqual([]);
  });
});
