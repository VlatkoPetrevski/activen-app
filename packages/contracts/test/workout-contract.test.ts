import { parseWorkout } from "@activen/domain";
import { describe, expect, it } from "vitest";
import { WorkoutStructureSchema } from "../src/requests.js";

/**
 * Contract between the parser (domain) and the API (requests): whatever the parser suggests must
 * be accepted when the coach saves it. A suggestion the API then refuses would be a dead end.
 */
const SAMPLES = [
  "14 km со 6 × 1000 м на 5K темпо",
  "10 km лесно",
  "2 km загревање, 5 × 1 km на 4:00/km со 90 s одмор, 1 km смирување",
  "8 x 400 m @ 3:30-3:40, 200 m jog",
  "8 x 400 m @ 3:40-3:30",
  "3 × 10 min Z3, 2 min rest",
  "4×5 мин на 4:10/км пауза 2 мин",
  "6 × 800 м на 0:45",
  "12 × 200 m at mile pace, 200 m walk",
  "20 min easy, 6 × 30 s strides",
  "Long run 28 km with last 5 km at marathon pace",
  "5 x 1 km at 1:31/km",
  "45 мин Z2",
  "50 × 100 m",
  "1 × 42 km",
];

describe("parser suggestions satisfy the save schema", () => {
  it.each(SAMPLES)("%s", (text) => {
    const structure = parseWorkout(text);
    if (structure === null) return;
    const parsed = WorkoutStructureSchema.safeParse(structure);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("recognises most of the samples", () => {
    const recognised = SAMPLES.filter((t) => parseWorkout(t) !== null);
    expect(recognised.length).toBeGreaterThanOrEqual(10);
  });
});
