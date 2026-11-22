import { describe, expect, it } from "vitest";
import {
  detectFormat,
  garminProductName,
  ImportError,
  MAX_FILE_BYTES,
  parseActivityFile,
  textActivityType,
  fitActivityType,
} from "../src/index.js";
import { bytesOf, garminTcx, intervalRunFit, START, stravaGpx } from "../src/testing.js";

const startS = START.getTime() / 1000;

function expectImportError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ImportError);
    expect((e as ImportError).code).toBe(code);
    return;
  }
  throw new Error(`expected ImportError ${code}`);
}

describe("FIT", () => {
  it("reads the rating the athlete gave on the watch", () => {
    expect(parseActivityFile(intervalRunFit()).rating).toBeNull();
    expect(
      parseActivityFile(intervalRunFit({ rating: { workoutRpe: 70, workoutFeel: 75 } })).rating,
    ).toEqual({ perceivedEffort: 7, feel: 4 });
    expect(parseActivityFile(intervalRunFit({ rating: { workoutRpe: 0 } })).rating).toEqual({
      perceivedEffort: 1,
      feel: null,
    });
    expect(parseActivityFile(intervalRunFit({ rating: { workoutFeel: 0 } })).rating).toEqual({
      perceivedEffort: null,
      feel: 1,
    });
    expect(
      parseActivityFile(intervalRunFit({ rating: { workoutRpe: 100, workoutFeel: 100 } })).rating,
    ).toEqual({ perceivedEffort: 10, feel: 5 });
    expect(parseActivityFile(bytesOf(stravaGpx())).rating).toBeNull();
  });

  it("reads an interval run with laps, device, strap and training load", () => {
    const a = parseActivityFile(intervalRunFit({ strap: true }));
    expect(a).toMatchObject({
      format: "fit",
      activityType: "RUNNING",
      startTimeInSeconds: startS,
      startTimeOffsetInSeconds: 3600,
      durationInSeconds: 1890,
      movingDurationInSeconds: 1870,
      averageHeartRateInBeatsPerMinute: 150,
      maxHeartRateInBeatsPerMinute: 172,
      activeKilocalories: 640,
      totalElevationGainInMeters: 31,
      trainingLoad: 142.4,
      averagePowerInWatts: 250,
      device: {
        manufacturer: "garmin",
        deviceName: "Forerunner 965",
        heartRateSensor: "chest_strap",
      },
    });
    expect(a.distanceInMeters).toBeCloseTo(6317.4, 0);
    expect(a.laps.map((l) => l.intensity)).toEqual([
      "warmup",
      "active",
      "recovery",
      "active",
      "recovery",
      "active",
      "recovery",
      "cooldown",
    ]);
    expect(a.laps[1]).toMatchObject({
      startOffsetInSeconds: 600,
      durationInSeconds: 240,
      averageHeartRateInBeatsPerMinute: 168,
      maxHeartRateInBeatsPerMinute: 172,
    });
    expect(a.laps[1]!.distanceInMeters).toBeCloseTo(1000.8, 0);
    // Samples: 1 Hz, GPS in degrees, running cadence in steps per minute.
    expect(a.streams.time).toHaveLength(1890);
    expect(a.streams.latitude![0]).toBeCloseTo(41.99812, 4);
    expect(a.streams.longitude![0]).toBeCloseTo(21.42543, 4);
    expect(a.streams.cadence![0]).toBe(170);
    expect(a.streams.heartRate![700]).toBe(168);
  });

  it("names devices, detects the optical sensor and maps sports", () => {
    const wrist = parseActivityFile(intervalRunFit({ subSport: "trail" }));
    expect(wrist.device.heartRateSensor).toBe("optical");
    expect(wrist.activityType).toBe("TRAIL_RUNNING");
    const edge = parseActivityFile(
      intervalRunFit({ product: 3843, sport: "cycling", subSport: "road" }),
    );
    expect(edge.device.deviceName).toBe("Edge 1040");
    expect(edge.activityType).toBe("ROAD_BIKING");
    // Cycling cadence is already revolutions per minute.
    expect(edge.streams.cadence![0]).toBe(85);
    const polar = parseActivityFile(intervalRunFit({ manufacturer: "polarElectro", product: 1 }));
    expect(polar.device).toMatchObject({ manufacturer: "polarElectro", deviceName: "Polar" });
  });

  it("recovers a file cut off before the summary, and ignores odd time offsets", () => {
    const cut = parseActivityFile(intervalRunFit({ withSession: false, offsetSeconds: 3601 }));
    expect(cut.activityType).toBe("OTHER");
    expect(cut.durationInSeconds).toBe(1889);
    expect(cut.distanceInMeters).toBeCloseTo(6317.4, 0);
    expect(cut.averageHeartRateInBeatsPerMinute).toBe(146);
    expect(cut.maxHeartRateInBeatsPerMinute).toBe(168);
    expect(cut.startTimeOffsetInSeconds).toBeNull();
    const edge = parseActivityFile(intervalRunFit({ withSession: false, product: 3843 }));
    expect(edge.activityType).toBe("CYCLING");
  });

  it("sums multisport sessions and lists strength sets as exercises", () => {
    const tri = parseActivityFile(intervalRunFit({ extraSession: true }));
    expect(tri).toMatchObject({
      activityType: "MULTI_SPORT",
      durationInSeconds: 2490,
      maxHeartRateInBeatsPerMinute: 180,
      totalElevationGainInMeters: 40,
      trainingLoad: 162.4,
    });
    const gym = parseActivityFile(
      intervalRunFit({
        sport: "training",
        subSport: "strengthTraining",
        sets: [
          { category: "squat", reps: 10, weight: 60 },
          { category: "squat", reps: 8, weight: 70 },
          { category: "benchPress", reps: 8, weight: 50 },
        ],
      }),
    );
    expect(gym.activityType).toBe("STRENGTH_TRAINING");
    expect(gym.exercises).toEqual([
      {
        category: "SQUAT",
        name: null,
        sets: [
          { reps: 10, weightInKilograms: 60, durationInSeconds: 40 },
          { reps: 8, weightInKilograms: 70, durationInSeconds: 40 },
        ],
      },
      {
        category: "BENCH_PRESS",
        name: null,
        sets: [{ reps: 8, weightInKilograms: 50, durationInSeconds: 40 }],
      },
    ]);
  });

  it("rejects FIT files that are not activities, and broken files", () => {
    expectImportError(
      () => parseActivityFile(intervalRunFit({ fileType: "workout" })),
      "no_activity",
    );
    const broken = intervalRunFit().slice(0, 40);
    expect(() => parseActivityFile(broken)).toThrow(ImportError);
  });
});

describe("GPX", () => {
  it("reads a Strava export: name, sport, distance from GPS, heart rate and elevation", () => {
    const a = parseActivityFile(bytesOf(stravaGpx()));
    expect(a).toMatchObject({
      format: "gpx",
      activityType: "RUNNING",
      activityName: "Вечерно трчање",
      startTimeInSeconds: startS,
      startTimeOffsetInSeconds: null,
      durationInSeconds: 599,
      maxHeartRateInBeatsPerMinute: 149,
      averageHeartRateInBeatsPerMinute: 145,
      device: { creator: "StravaGPX", deviceName: null },
      laps: [],
    });
    // 599 steps of 0.00002° in latitude and longitude ≈ 2.8 m each.
    expect(a.distanceInMeters).toBeGreaterThan(1650);
    expect(a.distanceInMeters).toBeLessThan(1700);
    expect(a.totalElevationGainInMeters).toBe(150);
    expect(a.movingDurationInSeconds).toBe(599);
    expect(a.streams.cadence![0]).toBe(88);
  });

  it("maps Strava's numeric types and refuses routes without times", () => {
    expect(parseActivityFile(bytesOf(stravaGpx(10, { type: "1" }))).activityType).toBe("CYCLING");
    expectImportError(
      () => parseActivityFile(bytesOf(stravaGpx(10, { times: false }))),
      "no_activity",
    );
    expectImportError(() => parseActivityFile(bytesOf("<gpx></gpx>")), "no_activity");
  });

  it("refuses external entities and leaves internal ones unexpanded", () => {
    const gpx = stravaGpx(5).replace(/^\uFEFF<\?xml[^>]*>/, "");
    const external = `<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///etc/passwd">]>${gpx.replace("Вечерно трчање", "&x;")}`;
    expectImportError(() => parseActivityFile(bytesOf(external)), "corrupt");
    const internal = `<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY x "boom">]>${gpx.replace("Вечерно трчање", "&x;")}`;
    expect(parseActivityFile(bytesOf(internal)).activityName).toBe("&x;");
  });
});

describe("TCX", () => {
  it("reads laps, resting laps, totals and the device name", () => {
    const a = parseActivityFile(bytesOf(garminTcx()));
    expect(a).toMatchObject({
      format: "tcx",
      activityType: "RUNNING",
      startTimeInSeconds: startS,
      durationInSeconds: 420,
      distanceInMeters: 1110,
      activeKilocalories: 70,
      maxHeartRateInBeatsPerMinute: 158,
      device: { deviceName: "Forerunner 265", creator: null },
    });
    expect(a.laps).toEqual([
      expect.objectContaining({
        intensity: "active",
        startOffsetInSeconds: 0,
        durationInSeconds: 300,
      }),
      expect.objectContaining({
        intensity: "rest",
        startOffsetInSeconds: 300,
        durationInSeconds: 120,
      }),
    ]);
    expect(a.streams.speed![10]).toBe(3.3);
    expect(a.streams.cadence![10]).toBe(86);
  });

  it("needs an activity", () => {
    expectImportError(
      () =>
        parseActivityFile(
          bytesOf("<TrainingCenterDatabase><Activities></Activities></TrainingCenterDatabase>"),
        ),
      "no_activity",
    );
  });
});

describe("format detection and limits", () => {
  it("detects by content, not by name", () => {
    expect(detectFormat(intervalRunFit())).toBe("fit");
    expect(detectFormat(bytesOf(stravaGpx(2)))).toBe("gpx");
    expect(detectFormat(bytesOf(garminTcx()))).toBe("tcx");
    expect(detectFormat(bytesOf("<kml></kml>"))).toBeNull();
    expect(detectFormat(bytesOf("hello"))).toBeNull();
  });

  it("rejects empty, oversized, unknown and malformed files", () => {
    expectImportError(() => parseActivityFile(new Uint8Array()), "empty");
    expectImportError(() => parseActivityFile(new Uint8Array(MAX_FILE_BYTES + 1)), "too_large");
    expectImportError(() => parseActivityFile(bytesOf("<kml></kml>")), "unsupported_format");
    expectImportError(() => parseActivityFile(bytesOf("<gpx><trk>")), "no_activity");
  });
});

describe("sport and device names", () => {
  it("maps FIT and free-text sports", () => {
    expect(fitActivityType("swimming", "openWater")).toBe("OPEN_WATER_SWIMMING");
    expect(fitActivityType("fitnessEquipment", "indoorRowing")).toBe("INDOOR_ROWING");
    expect(fitActivityType("hiking", "generic")).toBe("HIKING");
    expect(fitActivityType("kitesurfing", undefined)).toBe("OTHER");
    expect(textActivityType("trail_running")).toBe("TRAIL_RUNNING");
    expect(textActivityType("Biking")).toBe("CYCLING");
    expect(textActivityType("Other")).toBe("OTHER");
    expect(textActivityType("")).toBeNull();
  });

  it("turns Garmin product ids into model names", () => {
    expect(garminProductName("fr965")).toBe("Forerunner 965");
    expect(garminProductName("fenix7Pro")).toBe("fēnix 7 Pro");
    expect(garminProductName("edge1040")).toBe("Edge 1040");
    expect(garminProductName("venu3s")).toBe("Venu 3 S");
    expect(garminProductName("index")).toBe("index");
  });
});

describe("files with little data", () => {
  it("derives speed from distance when the file has none, and drops empty channels", () => {
    const tcx = garminTcx().replace(/<Extensions>.*?<\/Extensions>/g, "");
    const a = parseActivityFile(bytesOf(tcx));
    expect(a.streams.speed![5]).toBeCloseTo(3.3, 5);
    expect(a.streams.power).toBeUndefined();
    expect(a.movingDurationInSeconds).toBe(420);
  });

  it("keeps a GPS-less, heart-rate-less track honest", () => {
    const gpx = stravaGpx(30)
      .replace(/ lat="[^"]*" lon="[^"]*"/g, "")
      .replace(/<extensions>.*?<\/extensions>/g, "");
    const a = parseActivityFile(bytesOf(gpx));
    expect(a.distanceInMeters).toBeNull();
    expect(a.averageHeartRateInBeatsPerMinute).toBeNull();
    expect(a.streams.latitude).toBeUndefined();
  });

  it("refuses a track whose points share one time", () => {
    const gpx = stravaGpx(3).replace(/<time>[^<]*<\/time>/g, `<time>${START.toISOString()}</time>`);
    expectImportError(() => parseActivityFile(bytesOf(gpx)), "no_activity");
  });
});
