import { buildDemoLaps, buildDemoRoute } from "@activen/contracts";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Figure, Template, Theme, CardFormat } from "../src/share/model.js";
import { renderCard, type CardInput } from "../src/share/render.js";

/** A 2D context that records what is drawn (jsdom has no canvas). */
function recorder() {
  const calls: string[] = [];
  const texts: string[] = [];
  const gradient = { addColorStop: vi.fn() };
  const ctx = new Proxy(
    { measureText: (s: string) => ({ width: s.length * 20 }) } as Record<string, unknown>,
    {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        if (prop === "createLinearGradient" || prop === "createRadialGradient")
          return () => gradient;
        if (prop === "fillText")
          return (s: string) => {
            texts.push(s);
            calls.push("fillText");
          };
        return (..._args: unknown[]) => {
          calls.push(prop);
        };
      },
      set(target, prop: string, value) {
        target[prop] = value;
        return true;
      },
    },
  );
  return { ctx, calls, texts };
}

class FakePath2D {
  moveTo() {}
  lineTo() {}
}

beforeAll(() => vi.stubGlobal("Path2D", FakePath2D));
afterAll(() => vi.unstubAllGlobals());

const route = buildDemoRoute(10_000, 3).points as [number, number][];
const laps = buildDemoLaps(
  {
    activityType: "RUNNING",
    distanceInMeters: 12_000,
    durationInSeconds: 3600,
    averageHeartRateInBeatsPerMinute: 158,
    maxHeartRateInBeatsPerMinute: 180,
    startTimeInSeconds: 1,
  },
  "12 km фартлек 10 × 1 мин брзо / 1 мин лесно",
);
const base: CardInput = {
  format: "story",
  template: "route",
  theme: "ember",
  photo: null,
  photoSize: null,
  photoRoute: true,
  title: "Скопје — трчање со многу долг наслов што не собира во еден ред на картичката",
  subtitle: "среда, 18 ноември",
  stats: [
    { key: "distance", label: "Растојание", value: "12,02 km" },
    { key: "pace", label: "Темпо", value: "5:00 /km" },
    { key: "time", label: "Време", value: "1:00:00" },
    { key: "elevation", label: "Искачување", value: "60 m" },
  ],
  route,
  laps,
  figure: "runner",
};

function draw(input: Partial<CardInput>) {
  const { ctx, calls, texts } = recorder();
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  const ok = renderCard(canvas, { ...base, ...input });
  return { ok, calls, texts, canvas };
}

describe("share card renderer", () => {
  it.each(["story", "portrait", "square"] as CardFormat[])(
    "sizes the %s card at 1080 px",
    (format) => {
      const { ok, canvas } = draw({ format });
      expect(ok).toBe(true);
      expect(canvas.width).toBe(1080);
      expect(canvas.height).toBe({ story: 1920, portrait: 1350, square: 1080 }[format]);
    },
  );

  it.each(["route", "figure", "intervals", "bold", "photo"] as Template[])(
    "draws the %s template with title, numbers and brand",
    (template) => {
      const { calls, texts } = draw({ template });
      expect(texts).toContain("ActiveN");
      expect(texts.some((x) => x.endsWith("…"))).toBe(true); // long title ellipsized
      if (template === "bold") expect(texts).toContain("12,02 km");
      if (template === "route") expect(calls).toContain("stroke");
      if (template === "intervals")
        expect(calls.filter((c) => c === "roundRect").length).toBe(laps.length);
    },
  );

  it.each(["runner", "cyclist", "lifter", "swimmer", "walker"] as Figure[])(
    "draws the %s figure",
    (figure) => {
      const { calls } = draw({ template: "figure", figure });
      expect(calls.filter((c) => c === "stroke").length).toBeGreaterThan(3);
    },
  );

  it.each(["ember", "night", "light"] as Theme[])("supports the %s theme", (theme) => {
    expect(draw({ theme, template: "figure" }).ok).toBe(true);
  });

  it("covers the photo with scrims and puts the route in a corner", () => {
    const photo = {} as CanvasImageSource;
    const { calls } = draw({ template: "photo", photo, photoSize: { width: 1600, height: 1200 } });
    expect(calls).toContain("drawImage");
    const noRoute = draw({
      template: "photo",
      photo,
      photoSize: { width: 1600, height: 1200 },
      photoRoute: false,
    });
    expect(noRoute.calls.filter((c) => c === "stroke").length).toBeLessThan(
      calls.filter((c) => c === "stroke").length,
    );
  });

  it("copes with no numbers, no route and no laps", () => {
    for (const template of ["route", "intervals", "bold"] as Template[])
      expect(draw({ template, stats: [], route: null, laps: [] }).ok).toBe(true);
  });
});
