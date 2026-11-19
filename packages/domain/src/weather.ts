/**
 * Weather rules for the morning view: WMO weather codes → condition, European AQI → level, and an
 * "is it good to train outside" verdict. Pure functions; data comes from the weather provider.
 */

export type WeatherCondition =
  "clear" | "partly_cloudy" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "thunderstorm";

/** WMO 4677 weather interpretation codes (as used by Open-Meteo). */
export function weatherCondition(code: number): WeatherCondition {
  if (code === 0 || code === 1) return "clear";
  if (code === 2) return "partly_cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "thunderstorm";
  return "cloudy";
}

export const AQI_LEVELS = [
  "good",
  "fair",
  "moderate",
  "poor",
  "very_poor",
  "extremely_poor",
] as const;
export type AqiLevel = (typeof AQI_LEVELS)[number];

/** European Air Quality Index bands (EEA): 0–20 good … >100 extremely poor. */
export function aqiLevel(europeanAqi: number): AqiLevel {
  if (europeanAqi <= 20) return "good";
  if (europeanAqi <= 40) return "fair";
  if (europeanAqi <= 60) return "moderate";
  if (europeanAqi <= 80) return "poor";
  if (europeanAqi <= 100) return "very_poor";
  return "extremely_poor";
}

export type OutdoorLevel = "great" | "ok" | "poor";
export type OutdoorReason =
  "air_quality" | "heat" | "cold" | "rain" | "snow" | "thunderstorm" | "wind" | "uv";

export interface OutdoorInput {
  /** Feels-like temperature in °C (falls back to air temperature). */
  apparentTemperature: number;
  precipitationProbability: number | null;
  condition: WeatherCondition;
  windSpeedKmh: number | null;
  europeanAqi: number | null;
  uvIndex: number | null;
}

/**
 * Verdict for training outdoors. "poor" when something makes it unwise (thunderstorm, very poor air,
 * extreme heat/cold, strong wind); "ok" when it is doable with care; "great" otherwise. Reasons are
 * listed most important first so the UI can say why.
 */
export function outdoorSuitability(i: OutdoorInput): {
  level: OutdoorLevel;
  reasons: OutdoorReason[];
} {
  const poor: OutdoorReason[] = [];
  const ok: OutdoorReason[] = [];
  if (i.condition === "thunderstorm") poor.push("thunderstorm");
  if (i.europeanAqi !== null) {
    if (i.europeanAqi > 80) poor.push("air_quality");
    else if (i.europeanAqi > 50) ok.push("air_quality");
  }
  if (i.apparentTemperature >= 35) poor.push("heat");
  else if (i.apparentTemperature >= 28) ok.push("heat");
  if (i.apparentTemperature <= -15) poor.push("cold");
  else if (i.apparentTemperature <= 0) ok.push("cold");
  const wet = (i.precipitationProbability ?? 0) >= 60;
  if (i.condition === "snow" || (wet && i.apparentTemperature <= 1)) ok.push("snow");
  else if (i.condition === "rain" || i.condition === "drizzle" || wet) ok.push("rain");
  if (i.windSpeedKmh !== null) {
    if (i.windSpeedKmh >= 50) poor.push("wind");
    else if (i.windSpeedKmh >= 30) ok.push("wind");
  }
  if ((i.uvIndex ?? 0) >= 8) ok.push("uv");
  if (poor.length) return { level: "poor", reasons: [...poor, ...ok] };
  if (ok.length) return { level: "ok", reasons: ok };
  return { level: "great", reasons: [] };
}
