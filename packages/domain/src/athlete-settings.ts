import { estimatedMaxHeartRate, garminHeartRateZones, profileForDate } from "./hr-zones.js";
import { DEFAULT_SOURCE_PRIORITY } from "./source-policy.js";
import type { HrZone, HrZoneProfile, LocalDate, Vendor } from "./types.js";

/**
 * Where an athlete's heart-rate zones come from — a profile setting.
 *
 * - `source` (default): zones from the data sources, in the athlete's source priority order
 *   (e.g. Garmin zones when Garmin is the primary source). Manual zones are used only if no source
 *   provides any.
 * - `vendor`: always a specific vendor's zones (falls back like `source` if it has none).
 * - `manual`: the athlete's own zones entered in ActiveN.
 */
export type HrZoneSourceSetting =
  { mode: "source" } | { mode: "vendor"; vendor: Exclude<Vendor, "manual"> } | { mode: "manual" };

/** Athlete profile settings that drive data selection (stored per athlete, edited in the profile). */
export interface AthleteSettings {
  /** Data source priority, most trusted first. */
  sourcePriority: readonly Vendor[];
  hrZones: HrZoneSourceSetting;
  /** Measured or entered maximum heart rate; used for default zones. */
  maxHeartRate: number | null;
  /** Used to estimate max HR (220 − age) when none is known. */
  birthDate: LocalDate | null;
}

export const DEFAULT_ATHLETE_SETTINGS: Readonly<AthleteSettings> = Object.freeze<AthleteSettings>({
  sourcePriority: DEFAULT_SOURCE_PRIORITY,
  hrZones: { mode: "source" },
  maxHeartRate: null,
  birthDate: null,
});

/** Order in which zone profiles are looked up for the given setting. */
export function zoneSourcePreference(settings: AthleteSettings): Vendor[] {
  const vendors = settings.sourcePriority.filter((v) => v !== "manual");
  switch (settings.hrZones.mode) {
    case "source":
      return [...vendors, "manual"];
    case "vendor": {
      const chosen = settings.hrZones.vendor;
      return [chosen, ...vendors.filter((v) => v !== chosen), "manual"];
    }
    case "manual":
      return ["manual", ...vendors];
  }
}

export type ResolvedZoneOrigin = "vendor" | "manual" | "garmin_default";

export interface ResolvedHrZones {
  zones: HrZone[];
  origin: ResolvedZoneOrigin;
  /** The profile used, when the zones come from a vendor or manual profile. */
  profile: HrZoneProfile | null;
  /** True when the setting asked for a source that has no zones and another one was used. */
  fellBack: boolean;
}

/** Full years between two local dates. */
function ageOn(birthDate: LocalDate, date: LocalDate): number {
  const [by, bm, bd] = birthDate.split("-").map(Number) as [number, number, number];
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/**
 * Resolves the zones valid on `date` for an athlete:
 * 1. profiles in the order given by the profile setting (`zoneSourcePreference`);
 * 2. otherwise Garmin default zones from max HR (entered/measured, else 220 − age);
 * 3. otherwise `null` — the UI asks the athlete to connect a source or enter max HR.
 */
export function resolveHrZones(
  profiles: readonly HrZoneProfile[],
  date: LocalDate,
  settings: AthleteSettings,
): ResolvedHrZones | null {
  const preference = zoneSourcePreference(settings);
  const profile = profileForDate(profiles, date, preference);
  if (profile) {
    const requested = preference[0];
    return {
      zones: profile.zones,
      origin: profile.source === "manual" ? "manual" : "vendor",
      profile,
      fellBack: settings.hrZones.mode !== "source" && profile.source !== requested,
    };
  }
  const maxHr =
    settings.maxHeartRate ??
    (settings.birthDate ? estimatedMaxHeartRate(ageOn(settings.birthDate, date)) : null);
  if (maxHr === null) return null;
  return {
    zones: garminHeartRateZones(maxHr),
    origin: "garmin_default",
    profile: null,
    fellBack: settings.hrZones.mode !== "source",
  };
}
