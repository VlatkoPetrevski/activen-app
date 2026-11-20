import { describe, expect, it } from "vitest";
import { createFormatter, createTranslator, intlSupports } from "../src/index.js";

describe("Macedonian without ICU data (Chrome)", () => {
  const native = createFormatter(createTranslator("mk"), "metric", { intlSupported: true });
  const fallback = createFormatter(createTranslator("mk"), "metric", { intlSupported: false });

  it("formats dates like CLDR mk", () => {
    for (const style of ["full", "long", "short", "weekday", "dayMonth", "monthYear"] as const)
      expect(fallback.date("2026-11-19", style)).toBe(native.date("2026-11-19", style));
    expect(fallback.date("2026-11-19", "full")).toBe("четврток, 19 ноември 2026 г.");
    expect(fallback.date("2026-11-22", "weekdayShort")).toBe("нед.");
    expect(fallback.date("2026-03-02", "short")).toBe("02.03.2026 г.");
  });

  it("uses Macedonian separators and conjunction", () => {
    expect(fallback.distance(10370)).toBe("10,37 km");
    expect(fallback.speed(7.9)).toBe("28,4 km/h");
    expect(createFormatter(createTranslator("en"), "imperial").speed(7.9)).toBe("17.7 mph");
    expect(fallback.number(12345.6, 1)).toBe(native.number(12345.6, 1));
    expect(fallback.list(["а", "б", "в"])).toBe("а, б и в");
    expect(fallback.list(["а"])).toBe("а");
    expect(fallback.list([])).toBe("");
  });

  it("detects locale data", () => {
    expect(intlSupports("en")).toBe(true);
    expect(
      createFormatter(createTranslator("en"), "metric", { intlSupported: false }).date(
        "2026-11-19",
        "dayMonth",
      ),
    ).toBe("November 19");
  });
});
