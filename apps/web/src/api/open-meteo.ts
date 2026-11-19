import type { WeatherDto } from "@activen/contracts";
import type { Place } from "../lib/location.js";

/**
 * Open-Meteo (open-meteo.com): free forecast and air-quality APIs without keys, hosted in the EU.
 * Called from the browser with coarse coordinates only. Commercial use needs their API plan or a
 * self-hosted instance (see docs/open-questions.md).
 */
const FORECAST = "https://api.open-meteo.com/v1/forecast";
const AIR = "https://air-quality-api.open-meteo.com/v1/air-quality";

interface ForecastResponse {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    is_day: number;
    wind_speed_10m: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: (number | null)[];
    weather_code: number[];
  };
  daily: {
    temperature_2m_min: number[];
    temperature_2m_max: number[];
    sunrise: string[];
    sunset: string[];
    uv_index_max: (number | null)[];
    precipitation_probability_max: (number | null)[];
  };
}
interface AirResponse {
  current?: { european_aqi: number | null; pm2_5: number | null; pm10: number | null };
  hourly?: { time: string[]; european_aqi: (number | null)[] };
}

const hhmm = (iso: string | undefined) => (iso ?? "").slice(11, 16);

export async function fetchWeather(
  place: Place,
  fetchFn: typeof fetch = fetch,
): Promise<WeatherDto> {
  const coords = `latitude=${place.latitude}&longitude=${place.longitude}&timezone=auto&forecast_days=1`;
  const [forecastRes, airRes] = await Promise.all([
    fetchFn(
      `${FORECAST}?${coords}&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m` +
        "&hourly=temperature_2m,precipitation_probability,weather_code" +
        "&daily=temperature_2m_min,temperature_2m_max,sunrise,sunset,uv_index_max,precipitation_probability_max",
    ),
    // Air quality is optional: the weather still shows when it fails.
    fetchFn(`${AIR}?${coords}&current=european_aqi,pm2_5,pm10&hourly=european_aqi`).catch(
      () => null,
    ),
  ]);
  if (!forecastRes.ok) throw new Error(`Weather unavailable (${forecastRes.status})`);
  const f = (await forecastRes.json()) as ForecastResponse;
  const air = airRes?.ok ? ((await airRes.json()) as AirResponse) : null;
  const aqiByTime = new Map(
    (air?.hourly?.time ?? []).map((t, i) => [t, air?.hourly?.european_aqi[i] ?? null]),
  );
  const aqi = air?.current?.european_aqi;
  return {
    location: { name: place.name, latitude: place.latitude, longitude: place.longitude },
    current: {
      temperature: f.current.temperature_2m,
      apparentTemperature: f.current.apparent_temperature,
      weatherCode: f.current.weather_code,
      isDay: f.current.is_day === 1,
      windSpeedKmh: f.current.wind_speed_10m,
    },
    today: {
      min: f.daily.temperature_2m_min[0] ?? f.current.temperature_2m,
      max: f.daily.temperature_2m_max[0] ?? f.current.temperature_2m,
      sunrise: hhmm(f.daily.sunrise[0]),
      sunset: hhmm(f.daily.sunset[0]),
      uvIndexMax: f.daily.uv_index_max[0] ?? null,
      precipitationProbabilityMax: f.daily.precipitation_probability_max[0] ?? null,
    },
    hourly: f.hourly.time.map((time, i) => ({
      hour: Number(time.slice(11, 13)),
      temperature: f.hourly.temperature_2m[i] ?? 0,
      precipitationProbability: f.hourly.precipitation_probability[i] ?? null,
      weatherCode: f.hourly.weather_code[i] ?? 0,
      europeanAqi: aqiByTime.get(time) ?? null,
    })),
    airQuality:
      aqi === undefined || aqi === null
        ? null
        : {
            europeanAqi: aqi,
            pm2_5: air?.current?.pm2_5 ?? null,
            pm10: air?.current?.pm10 ?? null,
          },
  };
}
