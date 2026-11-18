import type { Transform } from "./transforms.js";

/**
 * ActiveN canonical data catalog.
 *
 * Every metric the platform stores has one canonical key, unit and meaning. Vendor fields that serve
 * the same purpose are mapped onto it; vendor metrics with no equivalent (Body Battery, Nightly
 * Recharge, Running Index, EPOC, Stamina…) become their own fields marked `origin: <vendor>`, so
 * they are never silently compared with another vendor's algorithm.
 *
 * Mapping status:
 * - `documented`  — field name confirmed in public vendor documentation (see docs/data-catalog.md).
 * - `fit_profile` — standard Garmin FIT SDK profile field, present in the vendor's FIT export.
 * - `to_confirm`  — purpose known, exact field name/units to be confirmed in the partner docs.
 */

export const CATALOG_VENDORS = ["garmin", "polar", "suunto", "coros"] as const;
export type CatalogVendor = (typeof CATALOG_VENDORS)[number];

export type MappingStatus = "documented" | "fit_profile" | "to_confirm";

export interface FieldMapping {
  /** `<Model>.<field>` in the vendor API, or `FIT <message>.<field>`. */
  path: string;
  transform: Transform;
  status: MappingStatus;
  note?: string;
}

export const DOMAINS = [
  "activity",
  "activity_lap",
  "activity_stream",
  "daily",
  "intraday",
  "sleep",
  "recovery",
  "stress",
  "spot_check",
  "body",
  "fitness",
  "training_load",
  "profile",
  "planned_workout",
  "route",
] as const;
export type Domain = (typeof DOMAINS)[number];

export const UNITS = [
  "text",
  "enum",
  "bool",
  "id",
  "datetime",
  "date",
  "s",
  "ms",
  "m",
  "mm",
  "cm",
  "deg",
  "m_s",
  "s_per_km",
  "bpm",
  "spm",
  "rpm",
  "brpm",
  "w",
  "kcal",
  "kg",
  "pct",
  "c",
  "mmhg",
  "ml_kg_min",
  "count",
  "score",
  "years",
  "series",
  "array",
] as const;
export type Unit = (typeof UNITS)[number];

/** How sensitive the data is (drives consent screens and coach visibility defaults). */
export type Sensitivity = "standard" | "health" | "special";

export interface CatalogField {
  key: string;
  domain: Domain;
  unit: Unit;
  /** Macedonian label for UI and documentation. */
  label: string;
  /** `common` = same purpose across vendors; a vendor = proprietary metric; `activen` = computed by us. */
  origin: "common" | "activen" | CatalogVendor;
  sensitivity: Sensitivity;
  mappings: Partial<Record<CatalogVendor, FieldMapping>>;
  note?: string;
}

// --- builders -----------------------------------------------------------------------------------

const mk =
  (status: MappingStatus) =>
  (path: string, transform: Transform = "none", note?: string): FieldMapping =>
    note === undefined ? { path, transform, status } : { path, transform, status, note };
const doc = mk("documented");
const fit = mk("fit_profile");
const tbc = mk("to_confirm");

type Opts = { origin?: CatalogField["origin"]; sensitivity?: Sensitivity; note?: string };

function f(
  key: string,
  domain: Domain,
  unit: Unit,
  label: string,
  mappings: CatalogField["mappings"],
  opts: Opts = {},
): CatalogField {
  const field: CatalogField = {
    key,
    domain,
    unit,
    label,
    origin: opts.origin ?? "common",
    sensitivity: opts.sensitivity ?? (domain.startsWith("activity") ? "standard" : "health"),
    mappings,
  };
  if (opts.note !== undefined) field.note = opts.note;
  return field;
}

// FIT message paths shared by Suunto and COROS (and Garmin's FIT export).
const fitBoth = (path: string, transform: Transform = "none", note?: string) => ({
  suunto: fit(path, transform, note),
  coros: fit(path, transform, note),
});

// --- catalog ------------------------------------------------------------------------------------

export const CATALOG: readonly CatalogField[] = Object.freeze([
  // ===== Activity (workout summary) =====
  f("activity.external_id", "activity", "id", "ID кај изворот", {
    garmin: doc("Activities.summaryId", "none", "activityId = ID во Garmin Connect"),
    polar: doc("Exercise.id"),
    suunto: tbc("Workout.workoutKey"),
    coros: tbc("getWorkoutRecords.labelId"),
  }),
  f("activity.start_time", "activity", "datetime", "Почеток", {
    garmin: doc("Activities.startTimeInSeconds", "epoch_s_to_iso"),
    polar: doc("Exercise.start_time", "none", "локално време + start_time_utc_offset"),
    ...fitBoth("FIT session.start_time"),
  }),
  f("activity.utc_offset_s", "activity", "s", "Временска зона (поместување)", {
    garmin: doc("Activities.startTimeOffsetInSeconds"),
    polar: tbc("Exercise.start_time_utc_offset", "none", "веројатно во минути"),
    ...fitBoth("FIT activity.local_timestamp − timestamp"),
  }),
  f("activity.name", "activity", "text", "Име на активност", {
    garmin: doc("Activities.activityName"),
    suunto: fit("FIT session.description (developer field)"),
    coros: tbc("getWorkoutRecords.name"),
  }),
  f("activity.sport", "activity", "enum", "Спорт", {
    garmin: doc("Activities.activityType", "none", "see catalog/sports.ts"),
    polar: doc("Exercise.sport + detailed_sport_info"),
    ...fitBoth("FIT session.sport + sub_sport"),
  }),
  f("activity.device", "activity", "text", "Уред", {
    garmin: doc("Activities.deviceName"),
    polar: doc("Exercise.device"),
    ...fitBoth("FIT file_id.product_name"),
  }),
  f("activity.elapsed_time_s", "activity", "s", "Вкупно време (elapsed)", {
    garmin: doc("Activities.durationInSeconds"),
    polar: doc("Exercise.duration", "iso_duration_to_s"),
    ...fitBoth("FIT session.total_elapsed_time"),
  }),
  f("activity.timer_time_s", "activity", "s", "Време без паузи", {
    garmin: doc("ActivityDetails.samples[-1].timerDurationInSeconds"),
    ...fitBoth("FIT session.total_timer_time"),
  }),
  f("activity.moving_time_s", "activity", "s", "Време во движење", {
    garmin: doc("ActivityDetails.samples[-1].movingDurationInSeconds"),
  }),
  f("activity.distance_m", "activity", "m", "Растојание", {
    garmin: doc("Activities.distanceInMeters"),
    polar: doc("Exercise.distance"),
    ...fitBoth("FIT session.total_distance"),
  }),
  f("activity.avg_speed_ms", "activity", "m_s", "Просечна брзина", {
    garmin: doc("Activities.averageSpeedInMetersPerSecond"),
    ...fitBoth("FIT session.avg_speed (enhanced_avg_speed)"),
  }),
  f("activity.max_speed_ms", "activity", "m_s", "Максимална брзина", {
    garmin: doc("Activities.maxSpeedInMetersPerSecond"),
    ...fitBoth("FIT session.max_speed"),
  }),
  f(
    "activity.avg_pace_s_per_km",
    "activity",
    "s_per_km",
    "Просечно темпо (од вендор)",
    {
      garmin: doc("Activities.averagePaceInMinutesPerKilometer", "min_per_km_to_s_per_km"),
    },
    { note: "ActiveN го пресметува темпото од elapsed time / растојание; ова е само за споредба." },
  ),
  f("activity.elevation_gain_m", "activity", "m", "Искачување", {
    garmin: doc("Activities.totalElevationGainInMeters"),
    polar: tbc(
      "Exercise TCX/samples type 3 (altitude)",
      "none",
      "нема поле во summary; се пресметува",
    ),
    ...fitBoth("FIT session.total_ascent"),
  }),
  f("activity.elevation_loss_m", "activity", "m", "Спуштање", {
    garmin: doc("Activities.totalElevationLossInMeters"),
    ...fitBoth("FIT session.total_descent"),
  }),
  f("activity.avg_hr", "activity", "bpm", "Просечен пулс", {
    garmin: doc("Activities.averageHeartRateInBeatsPerMinute"),
    polar: doc("Exercise.heart_rate.average"),
    ...fitBoth("FIT session.avg_heart_rate"),
  }),
  f("activity.max_hr", "activity", "bpm", "Максимален пулс", {
    garmin: doc("Activities.maxHeartRateInBeatsPerMinute"),
    polar: doc("Exercise.heart_rate.maximum"),
    ...fitBoth("FIT session.max_heart_rate"),
  }),
  f("activity.min_hr", "activity", "bpm", "Минимален пулс", {
    ...fitBoth("FIT session.min_heart_rate"),
  }),
  f("activity.calories_kcal", "activity", "kcal", "Калории", {
    garmin: doc(
      "Activities.activeKilocalories",
      "none",
      "изворите не се согласуваат дали вклучува BMR",
    ),
    polar: doc("Exercise.calories"),
    ...fitBoth("FIT session.total_calories"),
  }),
  f("activity.steps", "activity", "count", "Чекори", { garmin: doc("Activities.steps") }),
  f("activity.avg_run_cadence_spm", "activity", "spm", "Каденца трчање (просек)", {
    garmin: doc("Activities.averageRunCadenceInStepsPerMinute"),
    ...fitBoth(
      "FIT session.avg_cadence (+avg_fractional_cadence)",
      "none",
      "FIT за трчање често е по нога — проверка ×2",
    ),
  }),
  f("activity.max_run_cadence_spm", "activity", "spm", "Каденца трчање (макс.)", {
    garmin: doc("Activities.maxRunCadenceInStepsPerMinute"),
    ...fitBoth("FIT session.max_cadence", "none", "FIT за трчање често е по нога — проверка ×2"),
  }),
  f("activity.avg_bike_cadence_rpm", "activity", "rpm", "Каденца велосипед (просек)", {
    garmin: doc("Activities.averageBikeCadenceInRoundsPerMinute"),
    ...fitBoth("FIT session.avg_cadence"),
  }),
  f("activity.max_bike_cadence_rpm", "activity", "rpm", "Каденца велосипед (макс.)", {
    garmin: doc("Activities.maxBikeCadenceInRoundsPerMinute"),
    ...fitBoth("FIT session.max_cadence"),
  }),
  f("activity.avg_power_w", "activity", "w", "Просечна моќност", {
    garmin: fit("FIT session.avg_power"),
    polar: doc("ExerciseSamples type 4 (power)", "none", "просек од samples"),
    ...fitBoth("FIT session.avg_power"),
  }),
  f("activity.max_power_w", "activity", "w", "Максимална моќност", {
    garmin: fit("FIT session.max_power"),
    ...fitBoth("FIT session.max_power"),
  }),
  f("activity.normalized_power_w", "activity", "w", "Нормализирана моќност", {
    garmin: fit("FIT session.normalized_power"),
    coros: fit("FIT session.normalized_power"),
  }),
  f("activity.avg_temperature_c", "activity", "c", "Просечна температура", {
    garmin: doc("ActivityDetails.samples.airTemperatureCelcius", "none", "просек од samples"),
    ...fitBoth("FIT session.avg_temperature"),
  }),
  f(
    "activity.start_lat",
    "activity",
    "deg",
    "Почетна ширина",
    {
      garmin: doc("Activities.startingLatitudeInDegree"),
      polar: doc("Exercise.route[0].latitude"),
      ...fitBoth(
        "FIT session.start_position_lat",
        "none",
        "семикругови → степени во FIT декодерот",
      ),
    },
    { sensitivity: "health", note: "Локација — не се прикажува на тренер без согласност." },
  ),
  f(
    "activity.start_lon",
    "activity",
    "deg",
    "Почетна должина",
    {
      garmin: doc("Activities.startingLongitudeInDegree"),
      polar: doc("Exercise.route[0].longitude"),
      ...fitBoth(
        "FIT session.start_position_long",
        "none",
        "семикругови → степени во FIT декодерот",
      ),
    },
    { sensitivity: "health" },
  ),
  f("activity.has_route", "activity", "bool", "Има GPS рута", { polar: doc("Exercise.has_route") }),
  f("activity.is_manual", "activity", "bool", "Рачно внесена/изменета", {
    garmin: doc("Activities.manual"),
  }),
  f("activity.parent_id", "activity", "id", "Мултиспорт родител", {
    garmin: doc("Activities.parentSummaryId"),
  }),
  f("activity.pool_length_m", "activity", "m", "Должина на базен", {
    garmin: fit("FIT session.pool_length"),
    ...fitBoth("FIT session.pool_length"),
  }),
  f("activity.active_lengths", "activity", "count", "Пливани должини", {
    garmin: doc("Activities.numberOfActiveLengths"),
    ...fitBoth("FIT session.num_active_lengths"),
  }),
  f("activity.avg_swim_cadence_spm", "activity", "spm", "Каденца пливање", {
    garmin: doc("Activities.averageSwimCadenceInStrokesPerMinute"),
    suunto: fit("FIT length.avg_swimming_cadence"),
  }),
  f("activity.avg_swolf", "activity", "score", "SWOLF", { suunto: doc("FIT session.avg_swolf") }),
  f("activity.time_in_hr_zones_s", "activity", "array", "Време по HR зони", {
    garmin: fit("FIT session.time_in_hr_zone"),
    polar: doc("Exercise.heart_rate_zones[].in-zone", "iso_duration_to_s"),
    ...fitBoth("FIT session.time_in_hr_zone"),
  }),
  f(
    "activity.hr_zone_bounds",
    "activity",
    "array",
    "Граници на HR зони од вендорот",
    {
      polar: doc("Exercise.heart_rate_zones[].lower-limit/upper-limit"),
      suunto: doc("FIT session.aerobic_threshold / anaerobic_threshold"),
    },
    { note: "Извор за увоз на HR зони (zonesFromLowerBounds)." },
  ),
  f(
    "activity.rpe",
    "activity",
    "score",
    "Субјективен напор (RPE)",
    {
      polar: doc("Exercise.training_load_pro.user-rpe"),
      coros: tbc("workout feedback"),
    },
    { note: "Канонска скала 1–10; рачно внесување во ActiveN е примарен извор." },
  ),
  f(
    "activity.feeling",
    "activity",
    "score",
    "Чувство (1–5)",
    {
      suunto: doc("FIT session.feeling", "none", "1 = најлошо, 5 = најдобро"),
    },
    { note: "Се спојува со внесот „како се чувствуваш“ во ActiveN." },
  ),
  f("activity.aerobic_training_effect", "activity", "score", "Аеробен ефект (0–5)", {
    garmin: fit("FIT session.total_training_effect"),
    suunto: doc("FIT session.total_training_effect", "none", "Suunto: PTE"),
    coros: tbc("FIT session.total_training_effect"),
  }),
  f("activity.anaerobic_training_effect", "activity", "score", "Анаеробен ефект (0–5)", {
    garmin: fit("FIT session.total_anaerobic_training_effect"),
    coros: tbc("FIT session.total_anaerobic_training_effect"),
  }),
  f("activity.recovery_time_s", "activity", "s", "Препорачано време за опоравок", {
    suunto: doc("FIT session.recovery_time"),
    garmin: tbc("FIT (Garmin developer data)"),
    coros: tbc("workout summary"),
  }),
  f("activity.vo2max_estimate", "activity", "ml_kg_min", "VO2max проценка (по тренинг)", {
    suunto: doc("FIT session.estimated_vo2_max"),
  }),
  // Running dynamics (FIT profile)
  f("activity.avg_ground_contact_ms", "activity", "ms", "Контакт со подлога", {
    garmin: fit("FIT session.avg_stance_time"),
    coros: tbc("FIT session.avg_stance_time"),
  }),
  f("activity.avg_vertical_oscillation_mm", "activity", "mm", "Вертикална осцилација", {
    garmin: fit("FIT session.avg_vertical_oscillation"),
    coros: tbc("FIT session.avg_vertical_oscillation"),
  }),
  f("activity.avg_stride_length_mm", "activity", "mm", "Должина на чекор", {
    garmin: fit("FIT session.avg_step_length"),
    coros: tbc("FIT session.avg_step_length"),
  }),
  // Proprietary per-activity metrics
  f(
    "activity.polar_running_index",
    "activity",
    "score",
    "Polar Running Index",
    {
      polar: doc("Exercise.running-index"),
    },
    { origin: "polar" },
  ),
  f(
    "activity.polar_energy_sources_pct",
    "activity",
    "array",
    "Извори на енергија (масти/јаглехидрати/протеини)",
    {
      polar: doc("Exercise.fat_percentage / carbohydrate_percentage / protein_percentage"),
    },
    { origin: "polar" },
  ),
  f(
    "activity.polar_cardio_load",
    "activity",
    "score",
    "Polar Cardio Load",
    {
      polar: doc("Exercise.training_load_pro.cardio-load"),
    },
    { origin: "polar" },
  ),
  f(
    "activity.polar_muscle_load",
    "activity",
    "score",
    "Polar Muscle Load",
    {
      polar: doc("Exercise.training_load_pro.muscle-load"),
    },
    { origin: "polar" },
  ),
  f(
    "activity.polar_perceived_load",
    "activity",
    "score",
    "Polar Perceived Load",
    {
      polar: doc("Exercise.training_load_pro.perceived-load"),
    },
    { origin: "polar" },
  ),
  f(
    "activity.garmin_training_load",
    "activity",
    "score",
    "Garmin Training Load",
    {
      garmin: tbc("FIT session.training_load_peak"),
    },
    { origin: "garmin" },
  ),
  f(
    "activity.suunto_tss",
    "activity",
    "score",
    "Suunto TSS",
    {
      suunto: doc("Workout.tss / tssList"),
    },
    { origin: "suunto" },
  ),
  f(
    "activity.suunto_peak_epoc",
    "activity",
    "score",
    "Suunto EPOC",
    {
      suunto: doc("FIT session.peak_epoc"),
    },
    { origin: "suunto" },
  ),
  f(
    "activity.coros_training_load",
    "activity",
    "score",
    "COROS Training Load",
    {
      coros: tbc("workout summary trainingLoad"),
    },
    { origin: "coros" },
  ),
  f(
    "activity.trimp",
    "activity",
    "score",
    "TRIMP (ActiveN)",
    {},
    {
      origin: "activen",
      note: "Независен од вендор, пресметан од пулс и време; основа за споредба и оптоварување.",
    },
  ),

  // ===== Laps =====
  f("lap.start_time", "activity_lap", "datetime", "Почеток на круг", {
    garmin: doc("ActivityDetails.laps[].startTimeInSeconds", "epoch_s_to_iso"),
    ...fitBoth("FIT lap.start_time"),
  }),
  f("lap.elapsed_time_s", "activity_lap", "s", "Време на круг", {
    garmin: fit("FIT lap.total_elapsed_time"),
    ...fitBoth("FIT lap.total_elapsed_time"),
  }),
  f("lap.distance_m", "activity_lap", "m", "Растојание на круг", {
    garmin: fit("FIT lap.total_distance"),
    ...fitBoth("FIT lap.total_distance"),
  }),
  f("lap.avg_hr", "activity_lap", "bpm", "Просечен пулс (круг)", {
    garmin: fit("FIT lap.avg_heart_rate"),
    ...fitBoth("FIT lap.avg_heart_rate"),
  }),
  f("lap.max_hr", "activity_lap", "bpm", "Макс. пулс (круг)", {
    garmin: fit("FIT lap.max_heart_rate"),
    ...fitBoth("FIT lap.max_heart_rate"),
  }),
  f("lap.avg_speed_ms", "activity_lap", "m_s", "Брзина (круг)", {
    garmin: fit("FIT lap.avg_speed"),
    ...fitBoth("FIT lap.avg_speed"),
  }),
  f("lap.avg_power_w", "activity_lap", "w", "Моќност (круг)", {
    garmin: fit("FIT lap.avg_power"),
    ...fitBoth("FIT lap.avg_power"),
  }),
  f("lap.avg_cadence", "activity_lap", "spm", "Каденца (круг)", {
    garmin: fit("FIT lap.avg_cadence"),
    ...fitBoth("FIT lap.avg_cadence"),
  }),
  f("lap.ascent_m", "activity_lap", "m", "Искачување (круг)", {
    garmin: fit("FIT lap.total_ascent"),
    ...fitBoth("FIT lap.total_ascent"),
  }),
  f("lap.trigger", "activity_lap", "enum", "Причина за круг", {
    garmin: fit("FIT lap.lap_trigger"),
    ...fitBoth("FIT lap.lap_trigger"),
  }),

  // ===== Streams (samples) =====
  f("stream.time", "activity_stream", "series", "Време", {
    garmin: doc("ActivityDetails.samples.startTimeInSeconds"),
    polar: doc("ExerciseSamples.recording-rate", "none", "временска оска од recording-rate"),
    ...fitBoth("FIT record.timestamp"),
  }),
  f(
    "stream.position",
    "activity_stream",
    "series",
    "GPS позиција",
    {
      garmin: doc("ActivityDetails.samples.latitudeInDegree/longitudeInDegree"),
      polar: doc("Exercise.route[].latitude/longitude"),
      ...fitBoth("FIT record.position_lat/position_long"),
    },
    { sensitivity: "health" },
  ),
  f("stream.altitude_m", "activity_stream", "series", "Надморска висина", {
    garmin: doc("ActivityDetails.samples.elevationInMeters"),
    polar: doc("ExerciseSamples type 3"),
    ...fitBoth("FIT record.altitude"),
  }),
  f("stream.heart_rate", "activity_stream", "series", "Пулс", {
    garmin: doc("ActivityDetails.samples.heartrate"),
    polar: doc("ExerciseSamples type 0"),
    ...fitBoth("FIT record.heart_rate"),
  }),
  f("stream.speed_ms", "activity_stream", "series", "Брзина", {
    garmin: doc("ActivityDetails.samples.speedMetersPerSecond"),
    polar: doc("ExerciseSamples type 1", "kmh_to_ms"),
    ...fitBoth("FIT record.speed"),
  }),
  f("stream.distance_m", "activity_stream", "series", "Растојание", {
    garmin: doc("ActivityDetails.samples.totalDistanceInMeters"),
    polar: doc("ExerciseSamples type 10"),
    ...fitBoth("FIT record.distance"),
  }),
  f("stream.cadence", "activity_stream", "series", "Каденца", {
    garmin: doc("ActivityDetails.samples.stepsPerMinute / bikeCadenceInRPM"),
    polar: doc("ExerciseSamples type 2 (rpm) / 8 (spm)"),
    ...fitBoth("FIT record.cadence"),
  }),
  f("stream.power_w", "activity_stream", "series", "Моќност", {
    garmin: doc("ActivityDetails.samples.powerInWatts"),
    polar: doc("ExerciseSamples type 4"),
    ...fitBoth("FIT record.power"),
  }),
  f("stream.temperature_c", "activity_stream", "series", "Температура", {
    garmin: doc("ActivityDetails.samples.airTemperatureCelcius"),
    polar: doc("ExerciseSamples type 9"),
    coros: fit("FIT record.temperature"),
  }),
  f("stream.rr_interval_ms", "activity_stream", "series", "RR интервали", {
    polar: doc("ExerciseSamples type 11", "none", "само со H6/H7/H9/H10 сензор"),
    suunto: doc("FIT hrv.time", "none", "во секунди во FIT"),
    garmin: fit("FIT hrv.time"),
  }),
  f(
    "stream.suunto_epoc",
    "activity_stream",
    "series",
    "EPOC (тек)",
    {
      suunto: doc("FIT record.epoc"),
    },
    { origin: "suunto" },
  ),

  // ===== Daily =====
  f("daily.steps", "daily", "count", "Чекори", {
    garmin: doc("Dailies.steps"),
    polar: doc("DailyActivity.steps"),
    coros: tbc("getDailyData.steps"),
    suunto: tbc("247 activity steps"),
  }),
  f("daily.distance_m", "daily", "m", "Дневно растојание", {
    garmin: doc("Dailies.distanceInMeters"),
    polar: doc("DailyActivity.distance_from_steps"),
  }),
  f("daily.active_kcal", "daily", "kcal", "Активни калории", {
    garmin: doc("Dailies.activeKilocalories"),
    polar: doc("DailyActivity.active_calories"),
    coros: tbc("getDailyData.calories"),
  }),
  f("daily.bmr_kcal", "daily", "kcal", "Базални калории (BMR)", {
    garmin: doc("Dailies.bmrKilocalories"),
  }),
  f(
    "daily.total_kcal",
    "daily",
    "kcal",
    "Вкупно калории",
    {
      polar: doc("DailyActivity.calories"),
    },
    { note: "Garmin: active + BMR." },
  ),
  f("daily.active_time_s", "daily", "s", "Активно време", {
    garmin: doc("Dailies.activeTimeInSeconds"),
    polar: doc("DailyActivity.active_duration", "iso_duration_to_s"),
  }),
  f("daily.inactive_time_s", "daily", "s", "Неактивно време", {
    polar: doc("DailyActivity.inactive_duration", "iso_duration_to_s"),
  }),
  f("daily.moderate_intensity_s", "daily", "s", "Умерен интензитет", {
    garmin: doc("Dailies.moderateIntensityDurationInSeconds"),
  }),
  f("daily.vigorous_intensity_s", "daily", "s", "Висок интензитет", {
    garmin: doc("Dailies.vigorousIntensityDurationInSeconds"),
  }),
  f("daily.floors", "daily", "count", "Искачени катови", { garmin: doc("Dailies.floorsClimbed") }),
  f("daily.resting_hr", "daily", "bpm", "Пулс во мирување", {
    garmin: doc("Dailies.restingHeartRateInBeatsPerMinute"),
    polar: doc("PhysicalInfo.resting_heart_rate", "none", "профилна вредност, не дневна"),
    coros: doc("queryRestingHeartRate"),
  }),
  f("daily.min_hr", "daily", "bpm", "Мин. пулс (ден)", {
    garmin: doc("Dailies.minHeartRateInBeatsPerMinute"),
  }),
  f("daily.max_hr", "daily", "bpm", "Макс. пулс (ден)", {
    garmin: doc("Dailies.maxHeartRateInBeatsPerMinute"),
  }),
  f("daily.avg_hr", "daily", "bpm", "Просечен пулс (ден)", {
    garmin: doc(
      "Dailies.averageHeartRateInBeatsPerMinute",
      "none",
      "Garmin: просек на последните 7 дена",
    ),
    coros: doc("queryAvgHeartRate"),
  }),
  f("daily.avg_stress", "daily", "score", "Просечен стрес", {
    garmin: doc("Dailies.averageStressLevel", "none", "1–100; −1 = недоволно податоци"),
    coros: doc("queryStressLevel"),
  }),
  f("daily.max_stress", "daily", "score", "Макс. стрес", { garmin: doc("Dailies.maxStressLevel") }),
  f("daily.stress_durations_s", "daily", "array", "Време по стрес нивоа", {
    garmin: doc("Dailies.rest/low/medium/highStressDurationInSeconds"),
  }),
  f("daily.steps_goal", "daily", "count", "Цел за чекори", { garmin: doc("Dailies.stepsGoal") }),

  // ===== Intraday =====
  f("intraday.heart_rate", "intraday", "series", "Пулс низ денот", {
    garmin: doc("Dailies.timeOffsetHeartRateSamples"),
    polar: doc("ContinuousHeartRate.heart_rate_samples", "none", "5-минутни вредности"),
    coros: tbc("heart rate time series"),
  }),
  f("intraday.activity_epochs", "intraday", "series", "Активност по интервали", {
    garmin: doc("Epochs (15 min): activityType, met, intensity, steps"),
    polar: doc("DailyActivity.samples.activity_zones"),
  }),
  f("intraday.respiration", "intraday", "series", "Дишење низ денот", {
    garmin: doc("Respiration.timeOffsetEpochToBreaths"),
  }),
  f("intraday.spo2", "intraday", "series", "SpO2 низ денот", {
    garmin: doc("PulseOx.timeOffsetSpo2Values"),
  }),

  // ===== Sleep =====
  f("sleep.start_time", "sleep", "datetime", "Почеток на сон", {
    garmin: doc("Sleeps.startTimeInSeconds", "epoch_s_to_iso"),
    polar: doc("Sleep.sleep_start_time"),
    coros: tbc("sleep start"),
    suunto: tbc("247 sleep", "none", "Suunto FAQ: сонот можеби не е достапен преку Cloud API"),
  }),
  f(
    "sleep.end_time",
    "sleep",
    "datetime",
    "Крај на сон",
    {
      polar: doc("Sleep.sleep_end_time"),
      coros: tbc("sleep end"),
    },
    { note: "Garmin: start + duration + awake." },
  ),
  f("sleep.duration_s", "sleep", "s", "Времетраење на сон", {
    garmin: doc("Sleeps.durationInSeconds"),
    polar: doc("Sleep light+deep+rem"),
    coros: tbc("sleep total"),
  }),
  f("sleep.deep_s", "sleep", "s", "Длабок сон", {
    garmin: doc("Sleeps.deepSleepDurationInSeconds"),
    polar: doc("Sleep.deep_sleep"),
    coros: tbc("sleep deep"),
  }),
  f("sleep.light_s", "sleep", "s", "Лесен сон", {
    garmin: doc("Sleeps.lightSleepDurationInSeconds"),
    polar: doc("Sleep.light_sleep"),
    coros: tbc("sleep light"),
  }),
  f("sleep.rem_s", "sleep", "s", "REM сон", {
    garmin: doc("Sleeps.remSleepInSeconds"),
    polar: doc("Sleep.rem_sleep"),
    coros: tbc("sleep rem"),
  }),
  f("sleep.awake_s", "sleep", "s", "Будност / прекини", {
    garmin: doc("Sleeps.awakeDurationInSeconds"),
    polar: doc("Sleep.total_interruption_duration"),
    coros: tbc("sleep awake"),
  }),
  f("sleep.unmeasured_s", "sleep", "s", "Неизмерен сон", {
    garmin: doc("Sleeps.unmeasurableSleepInSeconds"),
    polar: doc("Sleep.unrecognized_sleep_stage"),
  }),
  f(
    "sleep.score",
    "sleep",
    "score",
    "Оценка на сон (0–100)",
    {
      garmin: doc("Sleeps.overallSleepScore.value"),
      polar: doc("Sleep.sleep_score"),
      coros: tbc("sleep score"),
    },
    { note: "Различни алгоритми; се прикажува со извор, не се усреднува меѓу вендори." },
  ),
  f("sleep.hypnogram", "sleep", "series", "Фази на сон (хипнограм)", {
    garmin: doc("Sleeps.sleepLevelsMap (deep/light/rem/awake)"),
    polar: doc("Sleep.hypnogram", "none", "0 будност, 1 REM, 2–3 лесен, 4 длабок, 5 непознато"),
  }),
  f("sleep.heart_rate", "sleep", "series", "Пулс во сон", {
    polar: doc("Sleep.heart_rate_samples"),
  }),
  f("sleep.respiration", "sleep", "series", "Дишење во сон", {
    garmin: doc("Sleeps.timeOffsetSleepRespiration"),
  }),
  f("sleep.spo2", "sleep", "series", "SpO2 во сон", { garmin: doc("Sleeps.timeOffsetSleepSpo2") }),
  f("sleep.naps", "sleep", "array", "Дремки", { garmin: doc("Sleeps.naps") }),
  f("sleep.cycles", "sleep", "count", "Циклуси на сон", { polar: doc("Sleep.sleep_cycles") }),
  f(
    "sleep.continuity",
    "sleep",
    "score",
    "Континуитет",
    {
      polar: doc("Sleep.continuity / continuity_class"),
    },
    { origin: "polar" },
  ),
  f("sleep.user_rating", "sleep", "score", "Лична оценка на сон", {
    polar: doc("Sleep.sleep_rating", "none", "0–5; 0 = не е внесено"),
  }),
  f(
    "sleep.polar_sleep_charge",
    "sleep",
    "score",
    "Polar Sleep Charge",
    {
      polar: doc("Sleep.sleep_charge", "none", "1–5 споредено со 28 дена"),
    },
    { origin: "polar" },
  ),

  // ===== Overnight recovery / readiness =====
  f("recovery.hrv_rmssd_ms", "recovery", "ms", "HRV ноќен просек (RMSSD)", {
    garmin: doc("HRV.lastNightAvg"),
    polar: doc("NightlyRecharge.heart_rate_variability_avg"),
    coros: doc("querySleepHrv (daily average)"),
    suunto: tbc("247 recovery HRV"),
  }),
  f("recovery.hrv_samples", "recovery", "series", "HRV низ ноќта", {
    garmin: doc("HRV.hrvValues"),
    polar: doc("NightlyRecharge.hrv_samples"),
    coros: doc("querySleepHrv (raw curve)"),
  }),
  f("recovery.hrv_5min_high_ms", "recovery", "ms", "HRV највисок 5-мин.", {
    garmin: doc("HRV.lastNight5MinHigh"),
  }),
  f(
    "recovery.hrv_baseline_range",
    "recovery",
    "array",
    "HRV нормален опсег",
    {
      coros: doc("querySleepHrv (normal range)"),
    },
    { note: "За другите вендори ActiveN го пресметува од 7/28-дневна историја." },
  ),
  f("recovery.night_hr_avg", "recovery", "bpm", "Ноќен пулс (просек)", {
    polar: doc("NightlyRecharge.heart_rate_avg"),
  }),
  f("recovery.night_breathing_rate", "recovery", "brpm", "Ноќно дишење (просек)", {
    polar: doc("NightlyRecharge.breathing_rate_avg"),
    garmin: doc("Sleeps.timeOffsetSleepRespiration", "none", "просек од samples"),
  }),
  f("recovery.skin_temp_deviation_c", "recovery", "c", "Отстапување на температура на кожа", {
    garmin: doc("SkinTemp.avgDeviationCelsius"),
    polar: doc("Biosensing.skintemperature.deviation_from_baseline_celsius"),
  }),
  f(
    "recovery.garmin_body_battery",
    "recovery",
    "series",
    "Garmin Body Battery",
    {
      garmin: doc("StressDetails.timeOffsetBodyBatteryValues (+ activity events)"),
    },
    { origin: "garmin" },
  ),
  f(
    "recovery.polar_nightly_recharge",
    "recovery",
    "score",
    "Polar Nightly Recharge (1–6)",
    {
      polar: doc("NightlyRecharge.nightly_recharge_status"),
    },
    { origin: "polar" },
  ),
  f(
    "recovery.polar_ans_charge",
    "recovery",
    "score",
    "Polar ANS charge (−10…+10)",
    {
      polar: doc("NightlyRecharge.ans_charge / ans_charge_status"),
    },
    { origin: "polar" },
  ),
  f(
    "recovery.polar_alertness",
    "recovery",
    "series",
    "Polar SleepWise будност",
    {
      polar: doc("SleepWise.alertness (grade, hourly_data)"),
    },
    { origin: "polar" },
  ),
  f(
    "recovery.polar_circadian_bedtime",
    "recovery",
    "array",
    "Polar циркадијално време за сон",
    {
      polar: doc("SleepWise.circadian-bedtime (sleep_gate_start/end_time)"),
    },
    { origin: "polar" },
  ),
  f(
    "recovery.coros_recovery_pct",
    "recovery",
    "pct",
    "COROS опоравок (%)",
    {
      coros: doc("recovery status (percentage, level, time to full recovery)"),
    },
    { origin: "coros" },
  ),
  f(
    "recovery.readiness",
    "recovery",
    "score",
    "Спремност (ActiveN)",
    {},
    {
      origin: "activen",
      note: "Утринска оценка од HRV vs baseline, пулс во мирување, сон и оптоварување — за брифингот.",
    },
  ),

  // ===== Stress =====
  f("stress.samples", "stress", "series", "Стрес низ денот", {
    garmin: doc("StressDetails.timeOffsetStressLevelValues", "none", "3-мин. просеци 1–100"),
    coros: doc("queryStressTimeSeries"),
  }),

  // ===== Spot checks (on-demand health measurements) =====
  f("spot.heart_rate", "spot_check", "bpm", "Мерење: пулс", {
    garmin: doc("HealthSnapshot.heartRateAvgValue"),
    coros: doc("queryHealthCheckTimeSeries (heart rate)"),
  }),
  f("spot.hrv_rmssd_ms", "spot_check", "ms", "Мерење: HRV (RMSSD)", {
    garmin: doc("HealthSnapshot.rmssdAvgValue"),
    coros: doc("queryHealthCheckTimeSeries (HRV)"),
    polar: doc("Biosensing.ecg.heart_rate_variability_ms"),
  }),
  f("spot.respiration", "spot_check", "brpm", "Мерење: дишење", {
    garmin: doc("HealthSnapshot.respirationAvgValue"),
    coros: doc("queryHealthCheckTimeSeries (respiratory rate)"),
  }),
  f("spot.spo2_pct", "spot_check", "pct", "Мерење: SpO2", {
    garmin: doc("PulseOx.timeOffsetSpo2Values (onDemand = true)"),
    polar: doc("Biosensing.spo2.blood_oxygen_percent"),
    coros: doc("queryHealthCheckTimeSeries (SpO2)"),
  }),
  f("spot.stress", "spot_check", "score", "Мерење: стрес", {
    garmin: doc("HealthSnapshot.stressAvgValue"),
    coros: doc("queryHealthCheckTimeSeries (stress)"),
  }),
  f("spot.body_temperature_c", "spot_check", "c", "Телесна температура", {
    polar: doc("Biosensing.bodytemperature.samples.temperature_celsius"),
  }),
  f(
    "spot.blood_pressure",
    "spot_check",
    "mmhg",
    "Крвен притисок",
    {
      garmin: doc("BloodPressure.systolic/diastolic/pulse"),
    },
    { sensitivity: "special" },
  ),
  f(
    "spot.ecg",
    "spot_check",
    "series",
    "ЕКГ",
    {
      polar: doc("Biosensing.ecg"),
    },
    { sensitivity: "special", note: "Медицински податок — надвор од опсегот; не се увезува." },
  ),

  // ===== Body =====
  f("body.weight_kg", "body", "kg", "Тежина", {
    garmin: doc("BodyComps.weightInGrams", "g_to_kg"),
    polar: doc("PhysicalInfo.weight"),
  }),
  f("body.height_cm", "body", "cm", "Висина", { polar: doc("PhysicalInfo.height") }),
  f("body.bmi", "body", "score", "BMI", { garmin: doc("BodyComps.bodyMassIndex") }),
  f("body.fat_pct", "body", "pct", "Масно ткиво", { garmin: doc("BodyComps.bodyFatInPercent") }),
  f("body.water_pct", "body", "pct", "Вода во телото", {
    garmin: doc("BodyComps.bodyWaterInPercent"),
  }),
  f("body.muscle_mass_kg", "body", "kg", "Мускулна маса", {
    garmin: doc("BodyComps.muscleMassInGrams", "g_to_kg"),
  }),
  f("body.bone_mass_kg", "body", "kg", "Коскена маса", {
    garmin: doc("BodyComps.boneMassInGrams", "g_to_kg"),
  }),

  // ===== Fitness & profile =====
  f("fitness.vo2max_running", "fitness", "ml_kg_min", "VO2max (трчање)", {
    garmin: doc("UserMetrics.vo2Max"),
    polar: doc("PhysicalInfo.vo2_max"),
    coros: doc("fitness overview VO2max"),
    suunto: doc("FIT session.estimated_vo2_max", "none", "по тренинг"),
  }),
  f("fitness.vo2max_cycling", "fitness", "ml_kg_min", "VO2max (велосипед)", {
    garmin: doc("UserMetrics.vo2MaxCycling"),
  }),
  f("fitness.fitness_age", "fitness", "years", "Фитнес возраст", {
    garmin: doc("UserMetrics.fitnessAge"),
  }),
  f("fitness.max_hr", "fitness", "bpm", "Максимален пулс (профил)", {
    polar: doc("PhysicalInfo.maximum_heart_rate"),
    coros: tbc("user profile max HR"),
    garmin: tbc("FIT user_profile / zones_target.max_heart_rate"),
  }),
  f("fitness.aerobic_threshold_hr", "fitness", "bpm", "Аеробен праг (пулс)", {
    polar: doc("PhysicalInfo.aerobic_threshold"),
    suunto: doc("FIT session.aerobic_threshold"),
  }),
  f("fitness.anaerobic_threshold_hr", "fitness", "bpm", "Анаеробен / лактатен праг (пулс)", {
    polar: doc("PhysicalInfo.anaerobic_threshold"),
    suunto: doc("FIT session.anaerobic_threshold"),
    coros: tbc("lactate threshold HR (lthr)"),
    garmin: tbc("FIT zones_target.threshold_heart_rate"),
  }),
  f("fitness.threshold_pace_s_per_km", "fitness", "s_per_km", "Прагово темпо", {
    coros: doc("fitness overview threshold pace"),
  }),
  f(
    "fitness.race_predictions",
    "fitness",
    "array",
    "Предвидени времиња (5к/10к/полу/маратон)",
    {
      coros: doc("fitness overview race predictions"),
    },
    { note: "ActiveN исто така пресметува сопствена предикција (вендор-независна)." },
  ),
  f("fitness.ftp_w", "fitness", "w", "FTP", {
    coros: tbc("cycling FTP"),
    garmin: tbc("FIT zones_target.functional_threshold_power"),
  }),
  f(
    "fitness.coros_running_fitness",
    "fitness",
    "score",
    "COROS Running Fitness",
    {
      coros: doc("fitness overview running level"),
    },
    { origin: "coros" },
  ),
  f(
    "fitness.coros_stamina",
    "fitness",
    "score",
    "COROS Base Fitness / Stamina",
    {
      coros: tbc("stamina_level"),
    },
    { origin: "coros" },
  ),

  // ===== Training load (period) =====
  f(
    "load.acute",
    "training_load",
    "score",
    "Краткорочно оптоварување",
    {
      polar: doc("CardioLoad.strain"),
      coros: doc("training load: short-term load"),
    },
    { note: "Различни скали; ActiveN пресметува сопствено acute/chronic од TRIMP." },
  ),
  f("load.chronic", "training_load", "score", "Долгорочно оптоварување", {
    polar: doc("CardioLoad.tolerance"),
    coros: doc("training load: long-term load"),
  }),
  f("load.ratio", "training_load", "score", "Однос акутно/хронично", {
    polar: doc("CardioLoad.cardio_load_ratio"),
    coros: doc("training load: ratio"),
  }),
  f("load.status", "training_load", "enum", "Статус на оптоварување", {
    polar: doc("CardioLoad.cardio_load_status"),
    coros: doc("training load: daily commentary / recovery level"),
  }),

  // ===== Profile =====
  f("profile.birth_date", "profile", "date", "Датум на раѓање", {
    polar: doc("PhysicalInfo.birthday"),
  }),
  f("profile.sex", "profile", "enum", "Пол", { polar: doc("PhysicalInfo.gender") }),
  f("profile.training_background", "profile", "enum", "Тренинг позадина", {
    polar: doc("PhysicalInfo.training_background"),
  }),
  f("profile.sleep_goal_s", "profile", "s", "Цел за сон", {
    polar: doc("PhysicalInfo.sleep_goal", "iso_duration_to_s"),
  }),

  // ===== Planned workout (write) =====
  f(
    "plan.workout",
    "planned_workout",
    "array",
    "Структуриран тренинг (испраќање на часовник)",
    {
      garmin: doc(
        "Training API: workoutName, sport, steps[stepOrder, intensity, durationType, durationValue, targetType, targetValueLow/High, targetZone], WorkoutRepeatStep.repeatValue",
      ),
      suunto: doc("SuuntoPlus Guides API (guide.json)"),
      coros: doc("workouts & training plans write (road/trail running, cycling)"),
    },
    {
      note: "Polar AccessLink нема испраќање тренинзи — Polar корисниците го гледаат планот во ActiveN.",
    },
  ),
  f("plan.schedule", "planned_workout", "date", "Закажан датум", {
    garmin: doc("Training API schedule: scheduledDate"),
    coros: doc("training calendar"),
  }),

  // ===== Routes (write) =====
  f("route.course", "route", "array", "Рута (GPX/курс)", {
    garmin: doc("Courses API"),
    coros: doc("GPX route import/export"),
    suunto: tbc("route upload"),
  }),
]);
