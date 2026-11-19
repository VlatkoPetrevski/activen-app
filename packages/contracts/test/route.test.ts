import { describe, expect, it } from "vitest";
import { buildDemoRoute } from "../src/index.js";

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
  it("roughly matches the distance and ends near the start", () => {
    for (const km of [6, 8, 10, 12, 14, 20, 27]) {
      const r = buildDemoRoute(km * 1000);
      const m = meters(r.points);
      expect(m / (km * 1000)).toBeGreaterThan(0.8);
      expect(m / (km * 1000)).toBeLessThan(1.3);
      const [s, e] = [r.points[0]!, r.points.at(-1)!];
      expect(Math.abs(s[0] - e[0]) + Math.abs(s[1] - e[1])).toBeLessThan(0.002);
    }
  });

  it("goes through the City Park on mid-length runs and carries map context", () => {
    const r = buildDemoRoute(10_000, 3);
    expect(r.points.some(([lat]) => lat > 42.009)).toBe(true);
    expect(r.context?.labels.map((l) => l.text)).toContain("Градски парк");
    expect(buildDemoRoute(10_000, 3)).toEqual(r);
  });
});
