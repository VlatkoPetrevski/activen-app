import { describe, expect, it } from "vitest";
import { aqiLevel, outdoorSuitability, weatherCondition } from "../src/index.js";

describe("weather", () => {
  it("maps WMO codes", () => {
    expect([0, 1, 2, 3, 45, 48, 53, 63, 81, 66, 73, 86, 95, 99, 20].map(weatherCondition)).toEqual([
      "clear",
      "clear",
      "partly_cloudy",
      "cloudy",
      "fog",
      "fog",
      "drizzle",
      "rain",
      "rain",
      "rain",
      "snow",
      "snow",
      "thunderstorm",
      "thunderstorm",
      "cloudy",
    ]);
  });

  it("bands the European AQI", () => {
    expect([10, 20, 35, 55, 75, 95, 140].map(aqiLevel)).toEqual([
      "good",
      "good",
      "fair",
      "moderate",
      "poor",
      "very_poor",
      "extremely_poor",
    ]);
  });

  const nice = {
    apparentTemperature: 14,
    precipitationProbability: 5,
    condition: "clear" as const,
    windSpeedKmh: 8,
    europeanAqi: 18,
    uvIndex: 3,
  };

  it("says great, ok or poor with reasons", () => {
    expect(outdoorSuitability(nice)).toEqual({ level: "great", reasons: [] });
    expect(outdoorSuitability({ ...nice, europeanAqi: 65 })).toEqual({
      level: "ok",
      reasons: ["air_quality"],
    });
    expect(
      outdoorSuitability({
        ...nice,
        europeanAqi: 95,
        precipitationProbability: 80,
        condition: "rain",
      }),
    ).toEqual({
      level: "poor",
      reasons: ["air_quality", "rain"],
    });
    expect(outdoorSuitability({ ...nice, condition: "thunderstorm" }).level).toBe("poor");
    expect(outdoorSuitability({ ...nice, apparentTemperature: 37 }).reasons).toEqual(["heat"]);
    expect(outdoorSuitability({ ...nice, apparentTemperature: 30, uvIndex: 9 }).reasons).toEqual([
      "heat",
      "uv",
    ]);
    expect(outdoorSuitability({ ...nice, apparentTemperature: -3 }).reasons).toEqual(["cold"]);
    expect(outdoorSuitability({ ...nice, apparentTemperature: -20 }).level).toBe("poor");
    expect(
      outdoorSuitability({ ...nice, apparentTemperature: 0, precipitationProbability: 70 }).reasons,
    ).toEqual(["cold", "snow"]);
    expect(outdoorSuitability({ ...nice, windSpeedKmh: 35 }).reasons).toEqual(["wind"]);
    expect(outdoorSuitability({ ...nice, windSpeedKmh: 55 }).level).toBe("poor");
    expect(
      outdoorSuitability({
        ...nice,
        europeanAqi: null,
        windSpeedKmh: null,
        uvIndex: null,
        precipitationProbability: null,
      }).level,
    ).toBe("great");
  });
});
