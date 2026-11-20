import type { ActivityInsight, WeatherDto } from "@activen/contracts";
import { parseWorkout } from "@activen/domain";
import { createFormatter, createTranslator } from "@activen/i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWeather } from "../src/api/open-meteo.js";
import { structureBlocks, workoutStructure } from "../src/lib/plan.js";
import { defaultPlace, requestDeviceLocation } from "../src/lib/location.js";
import { aqiColor, bestWindow, isNight } from "../src/lib/weather.js";
import { insightText } from "../src/training/Insights.js";
import { distanceOfPlan, paceOrSpeed, readsPace } from "../src/training/labels.js";

const tr = createTranslator("mk");
const t = tr.t as Parameters<typeof insightText>[0];
const f = createFormatter(tr);

describe("open-meteo", () => {
  const forecast = {
    current: {
      temperature_2m: 9.4,
      apparent_temperature: 7.1,
      weather_code: 2,
      is_day: 1,
      wind_speed_10m: 12,
    },
    hourly: {
      time: ["2026-11-20T10:00", "2026-11-20T11:00"],
      temperature_2m: [8, 9],
      precipitation_probability: [10, null],
      weather_code: [2, 3],
    },
    daily: {
      temperature_2m_min: [3],
      temperature_2m_max: [12],
      sunrise: ["2026-11-20T06:51"],
      sunset: ["2026-11-20T16:13"],
      uv_index_max: [2],
      precipitation_probability_max: [20],
    },
  };
  const air = {
    current: { european_aqi: 48, pm2_5: 21, pm10: 30 },
    hourly: { time: ["2026-11-20T10:00"], european_aqi: [52] },
  };
  const json = (body: unknown, ok = true) =>
    ({ ok, status: ok ? 200 : 503, json: async () => body }) as Response;
  const place = { name: "Скопје", latitude: 41.99, longitude: 21.43 };

  it("maps forecast and air quality, coarse coordinates only", async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (url: string) => {
      calls.push(url);
      return url.includes("air-quality") ? json(air) : json(forecast);
    });
    const w = await fetchWeather(place, fetchFn as unknown as typeof fetch);
    expect(calls.every((u) => u.includes("latitude=41.99&longitude=21.43"))).toBe(true);
    expect(w.current).toEqual({
      temperature: 9.4,
      apparentTemperature: 7.1,
      weatherCode: 2,
      isDay: true,
      windSpeedKmh: 12,
    });
    expect(w.today).toMatchObject({ min: 3, max: 12, sunrise: "06:51", sunset: "16:13" });
    expect(w.hourly).toEqual([
      { hour: 10, temperature: 8, precipitationProbability: 10, weatherCode: 2, europeanAqi: 52 },
      {
        hour: 11,
        temperature: 9,
        precipitationProbability: null,
        weatherCode: 3,
        europeanAqi: null,
      },
    ]);
    expect(w.airQuality).toEqual({ europeanAqi: 48, pm2_5: 21, pm10: 30 });
  });

  it("shows the weather without air quality, and fails without a forecast", async () => {
    const noAir = vi.fn(async (url: string) =>
      url.includes("air-quality") ? Promise.reject(new Error("down")) : json(forecast),
    );
    expect((await fetchWeather(place, noAir as unknown as typeof fetch)).airQuality).toBeNull();
    const down = vi.fn(async () => json({}, false));
    await expect(fetchWeather(place, down as unknown as typeof fetch)).rejects.toThrow(/503/);
  });
});

describe("location", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to the capital of the time zone, then to a saved place", () => {
    expect(defaultPlace("Europe/Berlin").name).toBe("Berlin");
    expect(defaultPlace("Pacific/Nowhere").name).toBe("Скопје");
    localStorage.setItem(
      "activen.weather.place",
      JSON.stringify({ name: null, latitude: 1, longitude: 2 }),
    );
    expect(defaultPlace("Europe/Berlin")).toEqual({ name: null, latitude: 1, longitude: 2 });
    localStorage.setItem("activen.weather.place", "{broken");
    expect(defaultPlace("Europe/Berlin").name).toBe("Berlin");
  });

  it("rounds the device position to about 1 km and remembers it", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({ coords: { latitude: 41.998123, longitude: 21.425987 } } as GeolocationPosition),
      },
    });
    expect(await requestDeviceLocation()).toEqual({ name: null, latitude: 42, longitude: 21.43 });
    expect(defaultPlace("Europe/Berlin").latitude).toBe(42);
  });

  it("rejects when location is unavailable or denied", async () => {
    vi.stubGlobal("navigator", {});
    await expect(requestDeviceLocation()).rejects.toThrow("unavailable");
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) =>
          fail({ code: 1, message: "denied" } as GeolocationPositionError),
      },
    });
    await expect(requestDeviceLocation()).rejects.toMatchObject({ code: 1 });
  });
});

describe("weather helpers", () => {
  const hour = (h: number, temperature: number, rain = 0, aqi: number | null = 20) => ({
    hour: h,
    temperature,
    precipitationProbability: rain,
    weatherCode: 1,
    europeanAqi: aqi,
  });
  const w = (hourly: WeatherDto["hourly"]): WeatherDto => ({
    location: { name: null, latitude: 0, longitude: 0 },
    current: {
      temperature: 10,
      apparentTemperature: 10,
      weatherCode: 1,
      isDay: true,
      windSpeedKmh: 5,
    },
    today: {
      min: 5,
      max: 15,
      sunrise: "07:00",
      sunset: "17:00",
      uvIndexMax: 1,
      precipitationProbabilityMax: 0,
    },
    hourly,
    airQuality: null,
  });

  it("picks the mildest, cleanest, driest daylight window", () => {
    const hourly = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((h) =>
      hour(h, h === 12 || h === 13 ? 14 : 4, h === 9 ? 80 : 0),
    );
    expect(bestWindow(w(hourly), 7)).toEqual({ from: 12, to: 14 });
    expect(bestWindow(w(hourly), 16)).toBeNull();
  });

  it("colours air quality and knows the night", () => {
    expect(aqiColor(null)).toBe("var(--border)");
    expect(aqiColor(10)).toBe("#50C8B4");
    expect(aqiColor(130)).toBe("#7D2181");
    expect(isNight(w([]), 6)).toBe(true);
    expect(isNight(w([]), 12)).toBe(false);
    expect(isNight(w([]), 18)).toBe(true);
  });
});

describe("insight text", () => {
  it("renders every insight code", () => {
    const all: ActivityInsight[] = [
      { code: "plan_on_target" },
      { code: "plan_over", percent: 12 },
      { code: "plan_under", percent: 20 },
      { code: "longest_recent" },
      { code: "pace_faster", secondsPerKm: 9 },
      { code: "pace_slower", secondsPerKm: 7 },
      { code: "lower_hr", bpm: 4 },
      { code: "higher_hr", bpm: 6 },
      { code: "big_load" },
      { code: "hilly", meters: 320 },
    ] as ActivityInsight[];
    const texts = all.map((i) => insightText(t, i));
    expect(texts.every((x) => x.length > 5 && !x.includes("{"))).toBe(true);
    expect(texts[1]).toContain("12");
    expect(texts[9]).toContain("320");
  });
});

describe("sport helpers", () => {
  it("reads pace for foot sports and speed for the rest", () => {
    expect(
      ["RUNNING", "TRAIL_RUNNING", "WALKING", "CYCLING", "LAP_SWIMMING"].map(readsPace),
    ).toEqual([true, true, true, false, false]);
    const a = { distanceInMeters: 10_000, durationInSeconds: 3000 };
    expect(paceOrSpeed(f, { ...a, activityType: "RUNNING" })).toEqual({
      kind: "pace",
      text: "5:00 /km",
    });
    expect(paceOrSpeed(f, { ...a, activityType: "CYCLING" })?.kind).toBe("speed");
    expect(paceOrSpeed(f, { ...a, activityType: "STRENGTH_TRAINING" })).toBeNull();
    expect(paceOrSpeed(f, { ...a, distanceInMeters: 300, activityType: "RUNNING" })).toBeNull();
  });

  it("shows distance against the plan", () => {
    expect(distanceOfPlan(f, 16_400, 70_000)).toBe("16/70 km");
    expect(distanceOfPlan(f, 16_400, 0)).toBe("16,4 km");
  });
});

describe("plan diagram", () => {
  it("draws accepted steps, repeats expanded", () => {
    const s = parseWorkout("Загревање 2 km, 3 × 1000 m на 3:50, одмор 400 m, смирување 1 km")!;
    const blocks = structureBlocks(s);
    expect(blocks.map((b) => b.intensity)).toEqual([2, 5, 1, 5, 1, 5, 2]);
    expect(blocks[0]?.weight).toBe(2);
    const entry = {
      kind: "workout" as const,
      description: "slobodno",
      plannedActivityType: "RUNNING" as const,
      structure: parseWorkout("10 km лесно Z2"),
    };
    expect(workoutStructure(entry)).toEqual([{ intensity: 2, weight: 10 }]);
    expect(workoutStructure({ ...entry, kind: "rest" })).toEqual([]);
  });
});
