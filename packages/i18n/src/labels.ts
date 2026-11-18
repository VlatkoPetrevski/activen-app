import {
  GARMIN_HR_ZONE_TEMPLATE,
  type ActivityGroup,
  type ActivityType,
  type HrvStatus,
  type HrZone,
  type LoadFocusCategory,
  type LoadFocusFeedback,
  type TrainingEffectBenefit,
  type TrainingReadinessLevel,
  type TrainingStatus,
} from "@activen/domain";
import { en, type MessageKey } from "./messages/en.js";
import type { Translator } from "./translate.js";

/**
 * Typed bridges from domain codes to message keys, so UI code never builds keys by hand.
 * The domain layer carries codes only; every label is resolved here.
 */
export const labels = {
  activityType: (t: Translator, v: ActivityType) => t.t(`activityType.${v}`),
  activityGroup: (t: Translator, v: ActivityGroup) => t.t(`activityGroup.${v}`),
  trainingReadiness: (t: Translator, v: TrainingReadinessLevel) =>
    t.t(`trainingReadiness.level.${v}`),
  trainingReadinessMessage: (t: Translator, v: TrainingReadinessLevel) =>
    t.t(`trainingReadiness.message.${v}`),
  hrvStatus: (t: Translator, v: HrvStatus) => t.t(`hrvStatus.${v}`),
  trainingEffect: (t: Translator, v: TrainingEffectBenefit) => t.t(`trainingEffect.benefit.${v}`),
  trainingStatus: (t: Translator, v: TrainingStatus) => t.t(`trainingStatus.${v}`),
  loadFocusCategory: (t: Translator, v: LoadFocusCategory) => t.t(`loadFocus.category.${v}`),
  loadFocusFeedback: (t: Translator, v: LoadFocusFeedback) => t.t(`loadFocus.feedback.${v}`),
} as const;

/**
 * Zone names: Garmin's default names (stored in English on generated profiles) are translated;
 * names the athlete typed or a vendor sent in its own wording are shown as they are.
 */
export function hrZoneName(t: Translator, zone: Pick<HrZone, "name">): string {
  const garmin = GARMIN_HR_ZONE_TEMPLATE.find((z) => z.name === zone.name);
  return garmin ? t.t(`hrZone.garmin.${garmin.zone}` as MessageKey) : zone.name;
}

/** The original Garmin (English) term for a key — shown as a subtitle under translated labels. */
export function garminTerm(key: MessageKey): string {
  return en[key];
}
