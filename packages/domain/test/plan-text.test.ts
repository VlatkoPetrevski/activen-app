import { describe, expect, it } from "vitest";
import { guessSport, parsePlanText } from "../src/index.js";

// Monday 23 Nov 2026 starts the first week in these examples.
const START = "2026-11-25";

describe("parsePlanText", () => {
  it("reads weekdays, several on a line, rest days and week headers", () => {
    const r = parsePlanText(
      [
        "Седмица 1: пон одмор, вто 6x1k @5K, сре 10 km лесно",
        "Чет: Сила 45 мин",
        "Седмица 2",
        "Пон - одмор",
        "Сабота: Долго 24 km",
        "  последните 5 km на маратонско темпо",
      ].join("\n"),
      START,
    );
    expect(r.skipped).toEqual([]);
    expect(r.days).toEqual([
      { date: "2026-11-23", kind: "rest", description: "", activityType: null },
      { date: "2026-11-24", kind: "workout", description: "6x1k @5K", activityType: "RUNNING" },
      { date: "2026-11-25", kind: "workout", description: "10 km лесно", activityType: "RUNNING" },
      {
        date: "2026-11-26",
        kind: "workout",
        description: "Сила 45 мин",
        activityType: "STRENGTH_TRAINING",
      },
      { date: "2026-11-30", kind: "rest", description: "", activityType: null },
      {
        date: "2026-12-05",
        kind: "workout",
        description: "Долго 24 km последните 5 km на маратонско темпо",
        activityType: "RUNNING",
      },
    ]);
  });

  it("reads dates in the usual forms, the year from the start, and English weekdays", () => {
    const r = parsePlanText(
      "24.11 10 km easy\n2026-11-26: Bike 60 min Z2\n05.01. Trail 15 km\n28/11 – rest\nSunday: swim 2000 m",
      START,
    );
    expect(r.days.map((d) => [d.date, d.kind, d.activityType])).toEqual([
      ["2026-11-24", "workout", "RUNNING"],
      ["2026-11-26", "workout", "CYCLING"],
      ["2027-01-05", "workout", "TRAIL_RUNNING"],
      ["2026-11-28", "rest", null],
      ["2026-11-29", "workout", "LAP_SWIMMING"],
    ]);
  });

  it("counts 'Ден N' from the start; keeps one-line descriptions with commas whole", () => {
    const r = parsePlanText("Ден 1: 6 × 1000 m, одмор 2 мин\nДен 3: 8 km", START);
    expect(r.days).toEqual([
      {
        date: "2026-11-25",
        kind: "workout",
        description: "6 × 1000 m, одмор 2 мин",
        activityType: "RUNNING",
      },
      { date: "2026-11-27", kind: "workout", description: "8 km", activityType: "RUNNING" },
    ]);
  });

  it("reports lines before the first day", () => {
    expect(parsePlanText("План за ноември\nпон 8 km", START).skipped).toEqual(["План за ноември"]);
  });

  it("guesses the sport from words", () => {
    expect(guessSport("Тренажер 45 мин")).toBe("INDOOR_CYCLING");
    expect(guessSport("Јога и истегнување")).toBe("YOGA");
    expect(guessSport("Темпо 8 km")).toBe("RUNNING");
  });
});
