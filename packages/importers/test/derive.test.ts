import { describe, expect, it } from "vitest";
import {
  cleanAltitude,
  cumulativeDistance,
  elevationGain,
  haversine,
  movingTime,
  simplifyRoute,
  speedFromDistance,
  thinStreams,
  trackOf,
} from "../src/derive.js";

describe("geometry", () => {
  it("measures great-circle distances", () => {
    // Skopje Stone Bridge → Kale fortress ≈ 640 m.
    expect(haversine([41.9965, 21.4314], [42.0003, 21.4334])).toBeCloseTo(455, -1);
    expect(haversine([0, 0], [0, 1])).toBeCloseTo(111_195, -1);
    expect(cumulativeDistance([0, null, 0], [0, null, 0.001])).toEqual([
      0,
      0,
      expect.closeTo(111.2, 0),
    ]);
    expect(cumulativeDistance([null], [null])).toEqual([null]);
  });

  it("simplifies a straight line to its ends and keeps corners", () => {
    const line = Array.from(
      { length: 50 },
      (_, i) => [41.99 + i * 0.0001, 21.43] as [number, number],
    );
    expect(simplifyRoute(line)).toHaveLength(2);
    const corner: [number, number][] = [
      [41.99, 21.43],
      [41.995, 21.43],
      [41.995, 21.44],
    ];
    expect(simplifyRoute(corner)).toHaveLength(3);
    expect(simplifyRoute([[1, 1]])).toEqual([[1, 1]]);
    expect(trackOf({ time: [0, 1], latitude: [1, null], longitude: [2, 3] })).toEqual([[1, 2]]);
    expect(trackOf({ time: [0] })).toEqual([]);
  });
});

describe("derived values", () => {
  it("counts climbs above the noise threshold only", () => {
    expect(elevationGain([100, 101, 100, 102, 100, 101])).toBe(0);
    expect(elevationGain([100, 110, 105, 120, null, 118])).toBe(25);
    expect(elevationGain([null])).toBeNull();
  });

  it("drops impossible altitudes and spikes", () => {
    expect(cleanAltitude([0, 1, 2, 3, 4], [250, 12_600, 251, -900, 252])).toEqual([
      250,
      null,
      251,
      null,
      252,
    ]);
    expect(cleanAltitude([0, 1, 2], [250, 400, 251])).toEqual([250, null, 251]);
  });

  it("measures moving time without pauses and gaps", () => {
    expect(movingTime([0, 1, 2, 3, 60, 61], [3, 3, 0, 3, 3, 3])).toBe(3);
    expect(movingTime([0], [3])).toBeNull();
    expect(speedFromDistance([0, 1, 1, 3], [0, 3, 3, 9])).toEqual([0, 3, null, 3]);
  });

  it("thins samples to one per second and a row limit", () => {
    const time = [0, 0.5, 1, 1.5, 2, 3, 4, 5];
    const hr = [1, 2, 3, 4, 5, 6, 7, 8];
    const thin = thinStreams({ time, heartRate: hr, power: hr.map(() => null) });
    expect(thin.time).toEqual([0, 1, 2, 3, 4, 5]);
    expect(thin.heartRate).toEqual([1, 3, 5, 6, 7, 8]);
    // An all-empty channel is dropped.
    expect(thin.power).toBeUndefined();
    expect(thinStreams({ time: [0, 1, 2, 3, 4, 5], heartRate: hr }, 3).time).toEqual([0, 2, 4]);
  });
});
