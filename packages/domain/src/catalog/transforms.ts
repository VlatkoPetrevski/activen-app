/**
 * Unit conversions used when mapping vendor fields onto the canonical model. Canonical units are
 * SI-like and fixed per field: seconds, metres, m/s, bpm, kcal, kg, °C, percent (0–100).
 */

export const TRANSFORMS = [
  "none",
  /** Garmin: grams → kilograms. */
  "g_to_kg",
  /** Polar samples: km/h → m/s. */
  "kmh_to_ms",
  /** Garmin: pace min/km → seconds per km. */
  "min_per_km_to_s_per_km",
  /** Polar: ISO-8601 duration ("PT1H2M3.5S") → seconds. */
  "iso_duration_to_s",
  /** Unix seconds + offset seconds → ISO-8601 UTC instant (offset kept separately). */
  "epoch_s_to_iso",
  /** Milliseconds → seconds. */
  "ms_to_s",
  /** Fraction 0–1 → percent 0–100. */
  "fraction_to_pct",
] as const;
export type Transform = (typeof TRANSFORMS)[number];

const ISO_DURATION_RE =
  /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/** Parses an ISO-8601 duration limited to days/hours/minutes/seconds. */
export function isoDurationToSeconds(value: string): number {
  const m = ISO_DURATION_RE.exec(value);
  if (!m || value === "P" || value.endsWith("T")) {
    throw new RangeError(`Unsupported ISO-8601 duration: "${value}"`);
  }
  const [d, h, min, s] = [m[1], m[2], m[3], m[4]].map((x) => (x === undefined ? 0 : Number(x)));
  return (d ?? 0) * 86_400 + (h ?? 0) * 3_600 + (min ?? 0) * 60 + (s ?? 0);
}

/**
 * Applies a transform. `null`/`undefined` stay `null` — a missing vendor value is never turned
 * into 0. Values of the wrong type throw, so adapter bugs surface in tests instead of bad data.
 */
export function applyTransform(transform: Transform, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  const num = (): number => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`Transform "${transform}" expects a finite number, got ${String(value)}`);
    }
    return value;
  };
  switch (transform) {
    case "none":
      return value;
    case "g_to_kg":
      return num() / 1000;
    case "kmh_to_ms":
      return num() / 3.6;
    case "min_per_km_to_s_per_km":
      return num() * 60;
    case "ms_to_s":
      return num() / 1000;
    case "fraction_to_pct":
      return num() * 100;
    case "iso_duration_to_s":
      if (typeof value !== "string") throw new TypeError("iso_duration_to_s expects a string");
      return isoDurationToSeconds(value);
    case "epoch_s_to_iso":
      return new Date(num() * 1000).toISOString();
  }
}
