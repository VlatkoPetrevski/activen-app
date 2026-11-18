/** Display helpers that reproduce the formats of the reference Excel report. */

const pad2 = (n: number): string => n.toString().padStart(2, "0");

/** Distance in km, rounded to 2 decimals. `null` stays `null`. */
export function metersToKm(meters: number | null): number | null {
  if (meters === null) return null;
  return Math.round(meters / 10) / 100;
}

/** Pace in seconds per km, or `null` when it cannot be derived (no/zero distance or time). */
export function paceSecondsPerKm(timeS: number | null, distanceM: number | null): number | null {
  if (timeS === null || distanceM === null || distanceM <= 0 || timeS <= 0) return null;
  return timeS / (distanceM / 1000);
}

/**
 * Formats a pace as `MM:SS` (min/km). Seconds are rounded; 4:59.6 becomes 5:00.
 * Paces of an hour or more per km keep counting minutes (e.g. `75:00`).
 */
export function formatPace(secondsPerKm: number | null): string {
  if (secondsPerKm === null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "";
  const total = Math.round(secondsPerKm);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/** Formats a duration as `HH:MM:SS`; hours keep counting past 24. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}
