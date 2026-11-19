import { describe, expect, it } from "vitest";
import { buildDemoRoute, DEMO_VARDAR } from "../src/index.js";

const meters = (pts: [number, number][]) =>
  pts.slice(1).reduce((s, p, i) => {
    const q = pts[i]!;
    return (
      s +
      Math.hypot(
        (p[0] - q[0]) * 111_320,
        (p[1] - q[1]) * 111_320 * Math.cos((p[0] * Math.PI) / 180),
      )
    );
  }, 0);

describe("demo route", () => {
  it("goes out along the river and comes back near the start", () => {
    const r = buildDemoRoute(10_000);
    expect(r.points.length).toBeGreaterThan(100);
    expect(r.water).toEqual([DEMO_VARDAR]);
    const [s, e] = [r.points[0]!, r.points.at(-1)!];
    expect(Math.abs(s[0] - e[0]) + Math.abs(s[1] - e[1])).toBeLessThan(0.002);
    expect(meters(r.points)).toBeGreaterThan(9_000);
    expect(meters(r.points)).toBeLessThan(11_500);
    expect(buildDemoRoute(10_000)).toEqual(r);
  });

  it("continues east when the west side is too short, and is capped by the river", () => {
    const long = buildDemoRoute(27_000);
    expect(meters(long.points)).toBeGreaterThan(25_000);
    expect(Math.max(...long.points.map((p) => p[1]))).toBeGreaterThan(21.45);
    expect(meters(buildDemoRoute(200_000).points)).toBeLessThan(60_000);
  });
});
