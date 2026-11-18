import { isLocalDate } from "./dates.js";
import type { HrZone, HrZoneProfile, LocalDate } from "./types.js";

/** Default profile from the reference report (spec §9). Editable per athlete. */
export const DEFAULT_HR_ZONES: readonly HrZone[] = Object.freeze([
  { name: "Easy", minBpm: null, maxBpm: 139, color: "#C6EFCE" },
  { name: "AeT", minBpm: 140, maxBpm: 150, color: "#FFEB9C" },
  { name: "Tempo", minBpm: 151, maxBpm: 165, color: "#F8CBAD" },
  { name: "AnT", minBpm: 166, maxBpm: 171, color: "#F4B084" },
  { name: "VO2max", minBpm: 172, maxBpm: null, color: "#FF7C80" },
]);

const MIN_PLAUSIBLE_BPM = 30;
const MAX_PLAUSIBLE_BPM = 250;
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export interface ZoneValidationError {
  zoneIndex: number | null;
  code:
    | "EMPTY"
    | "NAME_REQUIRED"
    | "NAME_DUPLICATE"
    | "COLOR_INVALID"
    | "FIRST_MIN_MUST_BE_OPEN"
    | "LAST_MAX_MUST_BE_OPEN"
    | "BOUND_REQUIRED"
    | "BOUND_NOT_INTEGER"
    | "BOUND_OUT_OF_RANGE"
    | "MIN_GREATER_THAN_MAX"
    | "GAP_OR_OVERLAP";
  message: string;
}

/**
 * Validates HR-03: zones are ordered low→high, contiguous on whole bpm, non-overlapping, and cover
 * the whole range (first zone open below, last zone open above).
 */
export function validateZones(zones: readonly HrZone[]): ZoneValidationError[] {
  const errors: ZoneValidationError[] = [];
  if (zones.length === 0) {
    return [{ zoneIndex: null, code: "EMPTY", message: "At least one zone is required." }];
  }

  const seen = new Set<string>();
  zones.forEach((z, i) => {
    const name = z.name.trim();
    if (!name)
      errors.push({ zoneIndex: i, code: "NAME_REQUIRED", message: "Zone name is required." });
    else if (seen.has(name.toLowerCase()))
      errors.push({
        zoneIndex: i,
        code: "NAME_DUPLICATE",
        message: `Duplicate zone name "${name}".`,
      });
    seen.add(name.toLowerCase());

    if (!HEX_COLOR_RE.test(z.color))
      errors.push({ zoneIndex: i, code: "COLOR_INVALID", message: `Color must be #RRGGBB.` });

    const isFirst = i === 0;
    const isLast = i === zones.length - 1;

    if (isFirst && z.minBpm !== null)
      errors.push({
        zoneIndex: i,
        code: "FIRST_MIN_MUST_BE_OPEN",
        message: "The first zone must have no lower bound.",
      });
    if (isLast && z.maxBpm !== null)
      errors.push({
        zoneIndex: i,
        code: "LAST_MAX_MUST_BE_OPEN",
        message: "The last zone must have no upper bound.",
      });

    const bounds: [string, number | null, boolean][] = [
      ["minBpm", z.minBpm, !isFirst],
      ["maxBpm", z.maxBpm, !isLast],
    ];
    for (const [label, value, required] of bounds) {
      if (value === null) {
        if (required)
          errors.push({ zoneIndex: i, code: "BOUND_REQUIRED", message: `${label} is required.` });
        continue;
      }
      if (!Number.isInteger(value))
        errors.push({
          zoneIndex: i,
          code: "BOUND_NOT_INTEGER",
          message: `${label} must be whole bpm.`,
        });
      else if (value < MIN_PLAUSIBLE_BPM || value > MAX_PLAUSIBLE_BPM)
        errors.push({
          zoneIndex: i,
          code: "BOUND_OUT_OF_RANGE",
          message: `${label} must be between ${MIN_PLAUSIBLE_BPM} and ${MAX_PLAUSIBLE_BPM}.`,
        });
    }

    if (z.minBpm !== null && z.maxBpm !== null && z.minBpm > z.maxBpm)
      errors.push({
        zoneIndex: i,
        code: "MIN_GREATER_THAN_MAX",
        message: "Lower bound is greater than upper bound.",
      });

    if (i > 0) {
      const prevMax = zones[i - 1]?.maxBpm ?? null;
      if (prevMax !== null && z.minBpm !== null && z.minBpm !== prevMax + 1)
        errors.push({
          zoneIndex: i,
          code: "GAP_OR_OVERLAP",
          message: `Zone must start at ${prevMax + 1} bpm (previous zone ends at ${prevMax}).`,
        });
    }
  });

  return errors;
}

/**
 * Classifies an average heart rate into a zone. Upper bounds are inclusive and the value belongs to
 * the first zone whose upper bound it does not exceed, so fractional averages (e.g. 139.4 from a
 * vendor) fall into the next zone up (AeT). This mirrors a nested `IF(HR<=139, …)` Excel formula.
 * Returns `null` when HR is missing (spec §10: blank zone, no color).
 */
export function classifyHr(avgHr: number | null, zones: readonly HrZone[]): HrZone | null {
  if (avgHr === null || !Number.isFinite(avgHr) || avgHr <= 0) return null;
  for (const zone of zones) {
    if (zone.maxBpm === null || avgHr <= zone.maxBpm) return zone;
  }
  return null;
}

/**
 * Picks the profile effective on `date` (HR-04): the latest `effectiveFrom` not after the date,
 * highest version winning ties. Dates before the first profile use the earliest profile so that
 * historical activities are still classified.
 */
export function profileForDate(
  profiles: readonly HrZoneProfile[],
  date: LocalDate,
): HrZoneProfile | null {
  if (profiles.length === 0) return null;
  const sorted = [...profiles].sort(
    (a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.version - b.version,
  );
  let chosen: HrZoneProfile | null = null;
  for (const p of sorted) {
    if (p.effectiveFrom <= date) chosen = p;
    else break;
  }
  return chosen ?? sorted[0] ?? null;
}

export class InvalidHrZoneProfileError extends Error {
  constructor(public readonly errors: ZoneValidationError[]) {
    super(`Invalid HR zone profile: ${errors.map((e) => e.message).join(" ")}`);
    this.name = "InvalidHrZoneProfileError";
  }
}

/**
 * HR-05: changing boundaries never mutates an existing profile; it produces a new version.
 */
export function createProfileVersion(
  previous: HrZoneProfile,
  params: { id: string; zones: HrZone[]; effectiveFrom: LocalDate; name?: string },
): HrZoneProfile {
  if (!isLocalDate(params.effectiveFrom))
    throw new RangeError(`Invalid effectiveFrom: "${params.effectiveFrom}"`);
  const errors = validateZones(params.zones);
  if (errors.length > 0) throw new InvalidHrZoneProfileError(errors);
  return {
    id: params.id,
    athleteId: previous.athleteId,
    name: params.name ?? previous.name,
    version: previous.version + 1,
    effectiveFrom: params.effectiveFrom,
    zones: params.zones.map((z) => ({ ...z })),
  };
}
