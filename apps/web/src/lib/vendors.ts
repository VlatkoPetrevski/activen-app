import type { Vendor } from "@activen/domain";

export const VENDOR_NAMES: Record<Vendor, string> = {
  garmin: "Garmin",
  polar: "Polar",
  suunto: "Suunto",
  coros: "COROS",
  wahoo: "Wahoo",
  strava: "Strava",
  apple_health: "Apple Health",
  google_health: "Health Connect",
  manual: "FIT / GPX / TCX",
};

export const vendorName = (v: string): string => VENDOR_NAMES[v as Vendor] ?? v;
