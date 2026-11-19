import type { WeatherDto } from "@activen/contracts";
import { aqiLevel, type AqiLevel } from "@activen/domain";

/** EEA European AQI colours. */
export const AQI_COLORS: Record<AqiLevel, string> = {
  good: "#50C8B4",
  fair: "#7CBF6A",
  moderate: "#E3C33D",
  poor: "#E8743B",
  very_poor: "#B8323F",
  extremely_poor: "#7D2181",
};

export const aqiColor = (aqi: number | null): string =>
  aqi === null ? "var(--border)" : AQI_COLORS[aqiLevel(aqi)];

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * Best two daylight hours to train outside today: mild temperature, clean air, low chance of
 * rain. Returns null when no daylight hours remain after `fromHour`.
 */
export function bestWindow(w: WeatherDto, fromHour: number): { from: number; to: number } | null {
  const sunrise = Math.ceil(minutes(w.today.sunrise || "07:00") / 60);
  const sunset = Math.floor(minutes(w.today.sunset || "17:00") / 60);
  const score = (h: WeatherDto["hourly"][number]) =>
    -Math.abs(Math.min(h.temperature, 30) - 14) * 1.5 -
    (h.europeanAqi ?? 30) * 0.6 -
    (h.precipitationProbability ?? 0) * 0.5;
  let best: { from: number; to: number; s: number } | null = null;
  for (let hour = Math.max(sunrise, fromHour); hour + 2 <= sunset; hour++) {
    const a = w.hourly.find((x) => x.hour === hour);
    const b = w.hourly.find((x) => x.hour === hour + 1);
    if (!a || !b) continue;
    const s = score(a) + score(b);
    if (!best || s > best.s) best = { from: hour, to: hour + 2, s };
  }
  return best ? { from: best.from, to: best.to } : null;
}

export const isNight = (w: WeatherDto, hour: number) =>
  hour * 60 + 30 < minutes(w.today.sunrise || "07:00") ||
  hour * 60 + 30 > minutes(w.today.sunset || "17:00");
