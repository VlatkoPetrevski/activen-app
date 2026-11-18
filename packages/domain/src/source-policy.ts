import type { Vendor } from "./types.js";

/**
 * What the vendor's API terms allow us to do with data obtained through it.
 *
 * These values are product/legal configuration, not code logic. They MUST be re-checked against the
 * current partner agreement before each vendor goes to production (see docs/open-questions.md).
 */
export interface SourcePolicy {
  /** Data may be shown to someone other than the athlete who connected the account (e.g. a coach). */
  displayToOthers: boolean;
  /** Data may be fed to AI/ML models (LLM-generated advice, model training). */
  aiProcessing: boolean;
  /** Human-readable reference for the rule. */
  basis: string;
}

export const SOURCE_POLICIES: Readonly<Record<Vendor, SourcePolicy>> = Object.freeze({
  strava: {
    displayToOthers: false,
    aiProcessing: false,
    basis:
      "Strava API Agreement (update of Nov 2024): data visible only to the authorizing user; no AI/ML use.",
  },
  garmin: {
    displayToOthers: true,
    aiProcessing: true,
    basis: "Garmin Connect Developer Program — verify in signed agreement before launch.",
  },
  polar: {
    displayToOthers: true,
    aiProcessing: true,
    basis: "Polar AccessLink Limited License — verify before launch.",
  },
  suunto: {
    displayToOthers: true,
    aiProcessing: true,
    basis: "Suunto partner agreement — verify before launch.",
  },
  coros: {
    displayToOthers: true,
    aiProcessing: true,
    basis: "COROS partner agreement — verify before launch.",
  },
  wahoo: {
    displayToOthers: true,
    aiProcessing: true,
    basis: "Wahoo Cloud API terms — verify before launch.",
  },
  apple_health: {
    displayToOthers: true,
    aiProcessing: true,
    basis: "On-device HealthKit data shared by the user; App Store health-data rules apply.",
  },
  google_health: {
    displayToOthers: true,
    aiProcessing: true,
    basis: "Health Connect data shared by the user; Google Play health-data policy applies.",
  },
  manual: {
    displayToOthers: true,
    aiProcessing: true,
    basis: "Entered or uploaded (FIT/GPX/TCX) by the athlete directly.",
  },
});

/**
 * Default source priority for a new athlete: device makers first, Strava last. Strava mostly
 * re-publishes data recorded by a watch, and its terms restrict sharing and AI use, so it only fills
 * gaps (e.g. when no other source is connected). The athlete can reorder this list.
 */
export const DEFAULT_SOURCE_PRIORITY: readonly Vendor[] = Object.freeze([
  "garmin",
  "suunto",
  "polar",
  "coros",
  "wahoo",
  "apple_health",
  "google_health",
  "manual",
  "strava",
]);

/** Who is looking at the data. */
export type Audience = "owner" | "coach";

export function canDisplay(vendor: Vendor, audience: Audience): boolean {
  return audience === "owner" || SOURCE_POLICIES[vendor].displayToOthers;
}

export function canUseForAi(vendor: Vendor): boolean {
  return SOURCE_POLICIES[vendor].aiProcessing;
}
