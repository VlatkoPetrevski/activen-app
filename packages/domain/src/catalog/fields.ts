import type { Transform } from "./transforms.js";

/**
 * ActiveN canonical data catalog.
 *
 * Initial phase: Garmin is the reference model. Canonical keys are `<garmin summary type>.<garmin
 * field name>` and units follow Garmin (e.g. `body_comps.weightInGrams`, pace in min/km). Fields
 * Garmin does not have get Garmin-style names. Vendor fields that serve the same purpose are mapped
 * onto the canonical field; vendor metrics with no equivalent (Body Battery, Nightly
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
  "activities",
  "activity_laps",
  "activity_samples",
  "dailies",
  "epochs",
  "sleeps",
  "hrv",
  "stress_details",
  "respiration",
  "pulse_ox",
  "skin_temp",
  "health_snapshot",
  "body_comps",
  "blood_pressure",
  "user_metrics",
  "training_status",
  "profile",
  "workouts",
  "courses",
] as const;
export type Domain = (typeof DOMAINS)[number];

export const UNITS = [
  "text",
  "enum",
  "bool",
  "id",
  "datetime",
  "unix_s",
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
  "g",
  "min_per_km",
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
    sensitivity:
      opts.sensitivity ??
      (domain === "activities" || domain === "activity_laps" || domain === "activity_samples"
        ? "standard"
        : "health"),
    mappings,
  };
  if (opts.note !== undefined) field.note = opts.note;
  return field;
}

// FIT message paths shared by Suunto and COROS (and Garmin's FIT export). FIT decoders return
// timestamps as dates; adapters convert them to Unix seconds.
const fitBoth = (path: string, transform: Transform = "none", note?: string) => ({
  suunto: fit(path, transform, note),
  coros: fit(path, transform, note),
});

// --- catalog ------------------------------------------------------------------------------------

export const CATALOG: readonly CatalogField[] = Object.freeze([
  // ===== Activity (workout summary) =====
  f("activities.summaryId", "activities", "id", "ID кај изворот", {
    garmin: doc("Activities.summaryId", "none", "activityId = ID во Garmin Connect"),
    polar: doc("Exercise.id"),
    suunto: tbc("Workout.workoutKey"),
    coros: tbc("getWorkoutRecords.labelId"),
  }),
  f("activities.startTimeInSeconds", "activities", "unix_s", "Почеток", {
    garmin: doc("Activities.startTimeInSeconds"),
    polar: doc("Exercise.start_time", "iso_to_epoch_s", "локално време + start_time_utc_offset"),
    ...fitBoth("FIT session.start_time"),
  }),
  f("activities.startTimeOffsetInSeconds", "activities", "s", "Временска зона (поместување)", {
    garmin: doc("Activities.startTimeOffsetInSeconds"),
    polar: tbc("Exercise.start_time_utc_offset", "none", "веројатно во минути"),
    ...fitBoth("FIT activity.local_timestamp − timestamp"),
  }),
  f("activities.activityName", "activities", "text", "Име на активност", {
    garmin: doc("Activities.activityName"),
    suunto: fit("FIT session.description (developer field)"),
    coros: tbc("getWorkoutRecords.name"),
  }),
  f("activities.activityType", "activities", "enum", "Спорт", {
    garmin: doc("Activities.activityType", "none", "see catalog/sports.ts"),
    polar: doc("Exercise.sport + detailed_sport_info"),
    ...fitBoth("FIT session.sport + sub_sport"),
  }),
  f("activities.deviceName", "activities", "text", "Уред", {
    garmin: doc("Activities.deviceName"),
    polar: doc("Exercise.device"),
    ...fitBoth("FIT file_id.product_name"),
  }),
  f("activities.durationInSeconds", "activities", "s", "Вкупно време (elapsed)", {
    garmin: doc("Activities.durationInSeconds"),
    polar: doc("Exercise.duration", "iso_duration_to_s"),
    ...fitBoth("FIT session.total_elapsed_time"),
  }),
  f("activities.timerDurationInSeconds", "activities", "s", "Време без паузи", {
    garmin: doc("ActivityDetails.samples[-1].timerDurationInSeconds"),
    ...fitBoth("FIT session.total_timer_time"),
  }),
  f("activities.movingDurationInSeconds", "activities", "s", "Време во движење", {
    garmin: doc("ActivityDetails.samples[-1].movingDurationInSeconds"),
  }),
  f("activities.distanceInMeters", "activities", "m", "Растојание", {
    garmin: doc("Activities.distanceInMeters"),
    polar: doc("Exercise.distance"),
    ...fitBoth("FIT session.total_distance"),
  }),
  f("activities.averageSpeedInMetersPerSecond", "activities", "m_s", "Просечна брзина", {
    garmin: doc("Activities.averageSpeedInMetersPerSecond"),
    ...fitBoth("FIT session.avg_speed (enhanced_avg_speed)"),
  }),
  f("activities.maxSpeedInMetersPerSecond", "activities", "m_s", "Максимална брзина", {
    garmin: doc("Activities.maxSpeedInMetersPerSecond"),
    ...fitBoth("FIT session.max_speed"),
  }),
  f(
    "activities.averagePaceInMinutesPerKilometer",
    "activities",
    "min_per_km",
    "Просечно темпо (од вендор)",
    {
      garmin: doc("Activities.averagePaceInMinutesPerKilometer"),
    },
    {
      note: "Garmin единица (min/km). ActiveN го пресметува темпото од elapsed time / растојание.",
    },
  ),
  f("activities.totalElevationGainInMeters", "activities", "m", "Искачување", {
    garmin: doc("Activities.totalElevationGainInMeters"),
    polar: tbc(
      "Exercise TCX/samples type 3 (altitude)",
      "none",
      "нема поле во summary; се пресметува",
    ),
    ...fitBoth("FIT session.total_ascent"),
  }),
  f("activities.totalElevationLossInMeters", "activities", "m", "Спуштање", {
    garmin: doc("Activities.totalElevationLossInMeters"),
    ...fitBoth("FIT session.total_descent"),
  }),
  f("activities.averageHeartRateInBeatsPerMinute", "activities", "bpm", "Просечен пулс", {
    garmin: doc("Activities.averageHeartRateInBeatsPerMinute"),
    polar: doc("Exercise.heart_rate.average"),
    ...fitBoth("FIT session.avg_heart_rate"),
  }),
  f("activities.maxHeartRateInBeatsPerMinute", "activities", "bpm", "Максимален пулс", {
    garmin: doc("Activities.maxHeartRateInBeatsPerMinute"),
    polar: doc("Exercise.heart_rate.maximum"),
    ...fitBoth("FIT session.max_heart_rate"),
  }),
  f("activities.minHeartRateInBeatsPerMinute", "activities", "bpm", "Минимален пулс", {
    ...fitBoth("FIT session.min_heart_rate"),
  }),
  f("activities.activeKilocalories", "activities", "kcal", "Калории", {
    garmin: doc(
      "Activities.activeKilocalories",
      "none",
      "изворите не се согласуваат дали вклучува BMR",
    ),
    polar: doc("Exercise.calories"),
    ...fitBoth("FIT session.total_calories"),
  }),
  f("activities.steps", "activities", "count", "Чекори", { garmin: doc("Activities.steps") }),
  f(
    "activities.averageRunCadenceInStepsPerMinute",
    "activities",
    "spm",
    "Каденца трчање (просек)",
    {
      garmin: doc("Activities.averageRunCadenceInStepsPerMinute"),
      ...fitBoth(
        "FIT session.avg_cadence (+avg_fractional_cadence)",
        "none",
        "FIT за трчање често е по нога — проверка ×2",
      ),
    },
  ),
  f("activities.maxRunCadenceInStepsPerMinute", "activities", "spm", "Каденца трчање (макс.)", {
    garmin: doc("Activities.maxRunCadenceInStepsPerMinute"),
    ...fitBoth("FIT session.max_cadence", "none", "FIT за трчање често е по нога — проверка ×2"),
  }),
  f(
    "activities.averageBikeCadenceInRoundsPerMinute",
    "activities",
    "rpm",
    "Каденца велосипед (просек)",
    {
      garmin: doc("Activities.averageBikeCadenceInRoundsPerMinute"),
      ...fitBoth("FIT session.avg_cadence"),
    },
  ),
  f(
    "activities.maxBikeCadenceInRoundsPerMinute",
    "activities",
    "rpm",
    "Каденца велосипед (макс.)",
    {
      garmin: doc("Activities.maxBikeCadenceInRoundsPerMinute"),
      ...fitBoth("FIT session.max_cadence"),
    },
  ),
  f("activities.averagePowerInWatts", "activities", "w", "Просечна моќност", {
    garmin: fit("FIT session.avg_power"),
    polar: doc("ExerciseSamples type 4 (power)", "none", "просек од samples"),
    ...fitBoth("FIT session.avg_power"),
  }),
  f("activities.maxPowerInWatts", "activities", "w", "Максимална моќност", {
    garmin: fit("FIT session.max_power"),
    ...fitBoth("FIT session.max_power"),
  }),
  f("activities.normalizedPowerInWatts", "activities", "w", "Нормализирана моќност", {
    garmin: fit("FIT session.normalized_power"),
    coros: fit("FIT session.normalized_power"),
  }),
  f("activities.averageTemperatureInCelsius", "activities", "c", "Просечна температура", {
    garmin: doc("ActivityDetails.samples.airTemperatureCelcius", "none", "просек од samples"),
    ...fitBoth("FIT session.avg_temperature"),
  }),
  f(
    "activities.startingLatitudeInDegree",
    "activities",
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
    "activities.startingLongitudeInDegree",
    "activities",
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
  f("activities.hasRoute", "activities", "bool", "Има GPS рута", {
    polar: doc("Exercise.has_route"),
  }),
  f("activities.manual", "activities", "bool", "Рачно внесена/изменета", {
    garmin: doc("Activities.manual"),
  }),
  f("activities.parentSummaryId", "activities", "id", "Мултиспорт родител", {
    garmin: doc("Activities.parentSummaryId"),
  }),
  f("activities.poolLengthInMeters", "activities", "m", "Должина на базен", {
    garmin: fit("FIT session.pool_length"),
    ...fitBoth("FIT session.pool_length"),
  }),
  f("activities.numberOfActiveLengths", "activities", "count", "Пливани должини", {
    garmin: doc("Activities.numberOfActiveLengths"),
    ...fitBoth("FIT session.num_active_lengths"),
  }),
  f("activities.averageSwimCadenceInStrokesPerMinute", "activities", "spm", "Каденца пливање", {
    garmin: doc("Activities.averageSwimCadenceInStrokesPerMinute"),
    suunto: fit("FIT length.avg_swimming_cadence"),
  }),
  f("activities.averageSwolf", "activities", "score", "SWOLF", {
    suunto: doc("FIT session.avg_swolf"),
  }),
  f("activities.timeInHeartRateZonesInSeconds", "activities", "array", "Време по HR зони", {
    garmin: fit("FIT session.time_in_hr_zone"),
    polar: doc("Exercise.heart_rate_zones[].in-zone", "iso_duration_to_s"),
    ...fitBoth("FIT session.time_in_hr_zone"),
  }),
  f(
    "activities.heartRateZoneBounds",
    "activities",
    "array",
    "Граници на HR зони од вендорот",
    {
      polar: doc("Exercise.heart_rate_zones[].lower-limit/upper-limit"),
      suunto: doc("FIT session.aerobic_threshold / anaerobic_threshold"),
    },
    { note: "Извор за увоз на HR зони (zonesFromLowerBounds)." },
  ),
  f(
    "activities.perceivedEffort",
    "activities",
    "score",
    "Субјективен напор (RPE)",
    {
      polar: doc("Exercise.training_load_pro.user-rpe"),
      coros: tbc("workout feedback"),
    },
    { note: "Канонска скала 1–10; рачно внесување во ActiveN е примарен извор." },
  ),
  f(
    "activities.feel",
    "activities",
    "score",
    "Чувство (1–5)",
    {
      suunto: doc("FIT session.feeling", "none", "1 = најлошо, 5 = најдобро"),
    },
    { note: "Се спојува со внесот „како се чувствуваш“ во ActiveN." },
  ),
  f("activities.aerobicTrainingEffect", "activities", "score", "Аеробен ефект (0–5)", {
    garmin: fit("FIT session.total_training_effect"),
    suunto: doc("FIT session.total_training_effect", "none", "Suunto: PTE"),
    coros: tbc("FIT session.total_training_effect"),
  }),
  f("activities.anaerobicTrainingEffect", "activities", "score", "Анаеробен ефект (0–5)", {
    garmin: fit("FIT session.total_anaerobic_training_effect"),
    coros: tbc("FIT session.total_anaerobic_training_effect"),
  }),
  f("activities.recoveryTimeInSeconds", "activities", "s", "Препорачано време за опоравок", {
    suunto: doc("FIT session.recovery_time"),
    garmin: tbc("FIT (Garmin developer data)"),
    coros: tbc("workout summary"),
  }),
  f("activities.vo2MaxEstimate", "activities", "ml_kg_min", "VO2max проценка (по тренинг)", {
    suunto: doc("FIT session.estimated_vo2_max"),
  }),
  // Running dynamics (FIT profile)
  f("activities.averageGroundContactTimeInMilliseconds", "activities", "ms", "Контакт со подлога", {
    garmin: fit("FIT session.avg_stance_time"),
    coros: tbc("FIT session.avg_stance_time"),
  }),
  f(
    "activities.averageVerticalOscillationInMillimeters",
    "activities",
    "mm",
    "Вертикална осцилација",
    {
      garmin: fit("FIT session.avg_vertical_oscillation"),
      coros: tbc("FIT session.avg_vertical_oscillation"),
    },
  ),
  f("activities.averageStrideLengthInMillimeters", "activities", "mm", "Должина на чекор", {
    garmin: fit("FIT session.avg_step_length"),
    coros: tbc("FIT session.avg_step_length"),
  }),
  // Proprietary per-activity metrics
  f(
    "activities.polarRunningIndex",
    "activities",
    "score",
    "Polar Running Index",
    {
      polar: doc("Exercise.running-index"),
    },
    { origin: "polar" },
  ),
  f(
    "activities.polarEnergySourcesInPercent",
    "activities",
    "array",
    "Извори на енергија (масти/јаглехидрати/протеини)",
    {
      polar: doc("Exercise.fat_percentage / carbohydrate_percentage / protein_percentage"),
    },
    { origin: "polar" },
  ),
  f(
    "activities.polarCardioLoad",
    "activities",
    "score",
    "Polar Cardio Load",
    {
      polar: doc("Exercise.training_load_pro.cardio-load"),
    },
    { origin: "polar" },
  ),
  f(
    "activities.polarMuscleLoad",
    "activities",
    "score",
    "Polar Muscle Load",
    {
      polar: doc("Exercise.training_load_pro.muscle-load"),
    },
    { origin: "polar" },
  ),
  f(
    "activities.polarPerceivedLoad",
    "activities",
    "score",
    "Polar Perceived Load",
    {
      polar: doc("Exercise.training_load_pro.perceived-load"),
    },
    { origin: "polar" },
  ),
  f(
    "activities.trainingLoad",
    "activities",
    "score",
    "Training Load (оптоварување на активноста)",
    {
      garmin: tbc("FIT session.training_load_peak"),
    },
    {
      note: "Garmin концепт (EPOC). Polar/Suunto/COROS имаат свои скали во посебни полиња; без Garmin се користи TRIMP.",
    },
  ),
  f(
    "activities.suuntoTss",
    "activities",
    "score",
    "Suunto TSS",
    {
      suunto: doc("Workout.tss / tssList"),
    },
    { origin: "suunto" },
  ),
  f(
    "activities.suuntoPeakEpoc",
    "activities",
    "score",
    "Suunto EPOC",
    {
      suunto: doc("FIT session.peak_epoc"),
    },
    { origin: "suunto" },
  ),
  f(
    "activities.corosTrainingLoad",
    "activities",
    "score",
    "COROS Training Load",
    {
      coros: tbc("workout summary trainingLoad"),
    },
    { origin: "coros" },
  ),
  f(
    "activities.trimp",
    "activities",
    "score",
    "TRIMP (ActiveN)",
    {},
    {
      origin: "activen",
      note: "Независен од вендор, пресметан од пулс и време; основа за споредба и оптоварување.",
    },
  ),

  // ===== Laps =====
  f("activity_laps.startTimeInSeconds", "activity_laps", "unix_s", "Почеток на круг", {
    garmin: doc("ActivityDetails.laps[].startTimeInSeconds"),
    ...fitBoth("FIT lap.start_time"),
  }),
  f("activity_laps.durationInSeconds", "activity_laps", "s", "Време на круг", {
    garmin: fit("FIT lap.total_elapsed_time"),
    ...fitBoth("FIT lap.total_elapsed_time"),
  }),
  f("activity_laps.distanceInMeters", "activity_laps", "m", "Растојание на круг", {
    garmin: fit("FIT lap.total_distance"),
    ...fitBoth("FIT lap.total_distance"),
  }),
  f(
    "activity_laps.averageHeartRateInBeatsPerMinute",
    "activity_laps",
    "bpm",
    "Просечен пулс (круг)",
    {
      garmin: fit("FIT lap.avg_heart_rate"),
      ...fitBoth("FIT lap.avg_heart_rate"),
    },
  ),
  f("activity_laps.maxHeartRateInBeatsPerMinute", "activity_laps", "bpm", "Макс. пулс (круг)", {
    garmin: fit("FIT lap.max_heart_rate"),
    ...fitBoth("FIT lap.max_heart_rate"),
  }),
  f("activity_laps.averageSpeedInMetersPerSecond", "activity_laps", "m_s", "Брзина (круг)", {
    garmin: fit("FIT lap.avg_speed"),
    ...fitBoth("FIT lap.avg_speed"),
  }),
  f("activity_laps.averagePowerInWatts", "activity_laps", "w", "Моќност (круг)", {
    garmin: fit("FIT lap.avg_power"),
    ...fitBoth("FIT lap.avg_power"),
  }),
  f("activity_laps.averageCadence", "activity_laps", "spm", "Каденца (круг)", {
    garmin: fit("FIT lap.avg_cadence"),
    ...fitBoth("FIT lap.avg_cadence"),
  }),
  f("activity_laps.totalElevationGainInMeters", "activity_laps", "m", "Искачување (круг)", {
    garmin: fit("FIT lap.total_ascent"),
    ...fitBoth("FIT lap.total_ascent"),
  }),
  f("activity_laps.lapTrigger", "activity_laps", "enum", "Причина за круг", {
    garmin: fit("FIT lap.lap_trigger"),
    ...fitBoth("FIT lap.lap_trigger"),
  }),

  // ===== Streams (samples) =====
  f("activity_samples.startTimeInSeconds", "activity_samples", "series", "Време", {
    garmin: doc("ActivityDetails.samples.startTimeInSeconds"),
    polar: doc("ExerciseSamples.recording-rate", "none", "временска оска од recording-rate"),
    ...fitBoth("FIT record.timestamp"),
  }),
  f(
    "activity_samples.position",
    "activity_samples",
    "series",
    "GPS позиција",
    {
      garmin: doc("ActivityDetails.samples.latitudeInDegree/longitudeInDegree"),
      polar: doc("Exercise.route[].latitude/longitude"),
      ...fitBoth("FIT record.position_lat/position_long"),
    },
    { sensitivity: "health" },
  ),
  f("activity_samples.elevationInMeters", "activity_samples", "series", "Надморска висина", {
    garmin: doc("ActivityDetails.samples.elevationInMeters"),
    polar: doc("ExerciseSamples type 3"),
    ...fitBoth("FIT record.altitude"),
  }),
  f("activity_samples.heartRate", "activity_samples", "series", "Пулс", {
    garmin: doc("ActivityDetails.samples.heartrate"),
    polar: doc("ExerciseSamples type 0"),
    ...fitBoth("FIT record.heart_rate"),
  }),
  f("activity_samples.speedMetersPerSecond", "activity_samples", "series", "Брзина", {
    garmin: doc("ActivityDetails.samples.speedMetersPerSecond"),
    polar: doc("ExerciseSamples type 1", "kmh_to_ms"),
    ...fitBoth("FIT record.speed"),
  }),
  f("activity_samples.totalDistanceInMeters", "activity_samples", "series", "Растојание", {
    garmin: doc("ActivityDetails.samples.totalDistanceInMeters"),
    polar: doc("ExerciseSamples type 10"),
    ...fitBoth("FIT record.distance"),
  }),
  f("activity_samples.cadence", "activity_samples", "series", "Каденца", {
    garmin: doc("ActivityDetails.samples.stepsPerMinute / bikeCadenceInRPM"),
    polar: doc("ExerciseSamples type 2 (rpm) / 8 (spm)"),
    ...fitBoth("FIT record.cadence"),
  }),
  f("activity_samples.powerInWatts", "activity_samples", "series", "Моќност", {
    garmin: doc("ActivityDetails.samples.powerInWatts"),
    polar: doc("ExerciseSamples type 4"),
    ...fitBoth("FIT record.power"),
  }),
  f("activity_samples.airTemperatureInCelsius", "activity_samples", "series", "Температура", {
    garmin: doc("ActivityDetails.samples.airTemperatureCelcius"),
    polar: doc("ExerciseSamples type 9"),
    coros: fit("FIT record.temperature"),
  }),
  f("activity_samples.rrIntervalInMilliseconds", "activity_samples", "series", "RR интервали", {
    polar: doc("ExerciseSamples type 11", "none", "само со H6/H7/H9/H10 сензор"),
    suunto: doc("FIT hrv.time", "none", "во секунди во FIT"),
    garmin: fit("FIT hrv.time"),
  }),
  f(
    "activity_samples.suuntoEpoc",
    "activity_samples",
    "series",
    "EPOC (тек)",
    {
      suunto: doc("FIT record.epoc"),
    },
    { origin: "suunto" },
  ),

  // ===== Daily =====
  f("dailies.steps", "dailies", "count", "Чекори", {
    garmin: doc("Dailies.steps"),
    polar: doc("DailyActivity.steps"),
    coros: tbc("getDailyData.steps"),
    suunto: tbc("247 activity steps"),
  }),
  f("dailies.distanceInMeters", "dailies", "m", "Дневно растојание", {
    garmin: doc("Dailies.distanceInMeters"),
    polar: doc("DailyActivity.distance_from_steps"),
  }),
  f("dailies.activeKilocalories", "dailies", "kcal", "Активни калории", {
    garmin: doc("Dailies.activeKilocalories"),
    polar: doc("DailyActivity.active_calories"),
    coros: tbc("getDailyData.calories"),
  }),
  f("dailies.bmrKilocalories", "dailies", "kcal", "Базални калории (BMR)", {
    garmin: doc("Dailies.bmrKilocalories"),
  }),
  f(
    "dailies.totalKilocalories",
    "dailies",
    "kcal",
    "Вкупно калории",
    {
      polar: doc("DailyActivity.calories"),
    },
    { note: "Garmin: active + BMR." },
  ),
  f("dailies.activeTimeInSeconds", "dailies", "s", "Активно време", {
    garmin: doc("Dailies.activeTimeInSeconds"),
    polar: doc("DailyActivity.active_duration", "iso_duration_to_s"),
  }),
  f("dailies.inactiveTimeInSeconds", "dailies", "s", "Неактивно време", {
    polar: doc("DailyActivity.inactive_duration", "iso_duration_to_s"),
  }),
  f("dailies.moderateIntensityDurationInSeconds", "dailies", "s", "Умерен интензитет", {
    garmin: doc("Dailies.moderateIntensityDurationInSeconds"),
  }),
  f("dailies.vigorousIntensityDurationInSeconds", "dailies", "s", "Висок интензитет", {
    garmin: doc("Dailies.vigorousIntensityDurationInSeconds"),
  }),
  f("dailies.floorsClimbed", "dailies", "count", "Искачени катови", {
    garmin: doc("Dailies.floorsClimbed"),
  }),
  f("dailies.restingHeartRateInBeatsPerMinute", "dailies", "bpm", "Пулс во мирување", {
    garmin: doc("Dailies.restingHeartRateInBeatsPerMinute"),
    polar: doc("PhysicalInfo.resting_heart_rate", "none", "профилна вредност, не дневна"),
    coros: doc("queryRestingHeartRate"),
  }),
  f("dailies.minHeartRateInBeatsPerMinute", "dailies", "bpm", "Мин. пулс (ден)", {
    garmin: doc("Dailies.minHeartRateInBeatsPerMinute"),
  }),
  f("dailies.maxHeartRateInBeatsPerMinute", "dailies", "bpm", "Макс. пулс (ден)", {
    garmin: doc("Dailies.maxHeartRateInBeatsPerMinute"),
  }),
  f("dailies.averageHeartRateInBeatsPerMinute", "dailies", "bpm", "Просечен пулс (ден)", {
    garmin: doc(
      "Dailies.averageHeartRateInBeatsPerMinute",
      "none",
      "Garmin: просек на последните 7 дена",
    ),
    coros: doc("queryAvgHeartRate"),
  }),
  f("dailies.averageStressLevel", "dailies", "score", "Просечен стрес", {
    garmin: doc("Dailies.averageStressLevel", "none", "1–100; −1 = недоволно податоци"),
    coros: doc("queryStressLevel"),
  }),
  f("dailies.maxStressLevel", "dailies", "score", "Макс. стрес", {
    garmin: doc("Dailies.maxStressLevel"),
  }),
  f("dailies.stressDurationsInSeconds", "dailies", "array", "Време по стрес нивоа", {
    garmin: doc("Dailies.rest/low/medium/highStressDurationInSeconds"),
  }),
  f("dailies.stepsGoal", "dailies", "count", "Цел за чекори", { garmin: doc("Dailies.stepsGoal") }),

  // ===== Intraday =====
  f("dailies.timeOffsetHeartRateSamples", "dailies", "series", "Пулс низ денот", {
    garmin: doc("Dailies.timeOffsetHeartRateSamples"),
    polar: doc("ContinuousHeartRate.heart_rate_samples", "none", "5-минутни вредности"),
    coros: tbc("heart rate time series"),
  }),
  f("epochs.epochSummaries", "epochs", "series", "Активност по интервали", {
    garmin: doc("Epochs (15 min): activityType, met, intensity, steps"),
    polar: doc("DailyActivity.samples.activity_zones"),
  }),
  f("respiration.timeOffsetEpochToBreaths", "respiration", "series", "Дишење низ денот", {
    garmin: doc("Respiration.timeOffsetEpochToBreaths"),
  }),
  f("pulse_ox.timeOffsetSpo2Values", "pulse_ox", "series", "SpO2 низ денот", {
    garmin: doc("PulseOx.timeOffsetSpo2Values"),
  }),

  // ===== Sleep =====
  f("sleeps.startTimeInSeconds", "sleeps", "unix_s", "Почеток на сон", {
    garmin: doc("Sleeps.startTimeInSeconds"),
    polar: doc("Sleep.sleep_start_time", "iso_to_epoch_s"),
    coros: tbc("sleep start"),
    suunto: tbc("247 sleep", "none", "Suunto FAQ: сонот можеби не е достапен преку Cloud API"),
  }),
  f(
    "sleeps.endTimeInSeconds",
    "sleeps",
    "unix_s",
    "Крај на сон",
    {
      polar: doc("Sleep.sleep_end_time", "iso_to_epoch_s"),
      coros: tbc("sleep end"),
    },
    { note: "Garmin: start + duration + awake." },
  ),
  f("sleeps.durationInSeconds", "sleeps", "s", "Времетраење на сон", {
    garmin: doc("Sleeps.durationInSeconds"),
    polar: doc("Sleep light+deep+rem"),
    coros: tbc("sleep total"),
  }),
  f("sleeps.deepSleepDurationInSeconds", "sleeps", "s", "Длабок сон", {
    garmin: doc("Sleeps.deepSleepDurationInSeconds"),
    polar: doc("Sleep.deep_sleep"),
    coros: tbc("sleep deep"),
  }),
  f("sleeps.lightSleepDurationInSeconds", "sleeps", "s", "Лесен сон", {
    garmin: doc("Sleeps.lightSleepDurationInSeconds"),
    polar: doc("Sleep.light_sleep"),
    coros: tbc("sleep light"),
  }),
  f("sleeps.remSleepInSeconds", "sleeps", "s", "REM сон", {
    garmin: doc("Sleeps.remSleepInSeconds"),
    polar: doc("Sleep.rem_sleep"),
    coros: tbc("sleep rem"),
  }),
  f("sleeps.awakeDurationInSeconds", "sleeps", "s", "Будност / прекини", {
    garmin: doc("Sleeps.awakeDurationInSeconds"),
    polar: doc("Sleep.total_interruption_duration"),
    coros: tbc("sleep awake"),
  }),
  f("sleeps.unmeasurableSleepInSeconds", "sleeps", "s", "Неизмерен сон", {
    garmin: doc("Sleeps.unmeasurableSleepInSeconds"),
    polar: doc("Sleep.unrecognized_sleep_stage"),
  }),
  f(
    "sleeps.overallSleepScore",
    "sleeps",
    "score",
    "Оценка на сон (0–100)",
    {
      garmin: doc("Sleeps.overallSleepScore.value"),
      polar: doc("Sleep.sleep_score"),
      coros: tbc("sleep score"),
    },
    { note: "Различни алгоритми; се прикажува со извор, не се усреднува меѓу вендори." },
  ),
  f("sleeps.sleepLevelsMap", "sleeps", "series", "Фази на сон (хипнограм)", {
    garmin: doc("Sleeps.sleepLevelsMap (deep/light/rem/awake)"),
    polar: doc("Sleep.hypnogram", "none", "0 будност, 1 REM, 2–3 лесен, 4 длабок, 5 непознато"),
  }),
  f("sleeps.sleepHeartRateSamples", "sleeps", "series", "Пулс во сон", {
    polar: doc("Sleep.heart_rate_samples"),
  }),
  f("sleeps.timeOffsetSleepRespiration", "sleeps", "series", "Дишење во сон", {
    garmin: doc("Sleeps.timeOffsetSleepRespiration"),
  }),
  f("sleeps.timeOffsetSleepSpo2", "sleeps", "series", "SpO2 во сон", {
    garmin: doc("Sleeps.timeOffsetSleepSpo2"),
  }),
  f("sleeps.naps", "sleeps", "array", "Дремки", { garmin: doc("Sleeps.naps") }),
  f("sleeps.sleepCycles", "sleeps", "count", "Циклуси на сон", {
    polar: doc("Sleep.sleep_cycles"),
  }),
  f(
    "sleeps.polarContinuity",
    "sleeps",
    "score",
    "Континуитет",
    {
      polar: doc("Sleep.continuity / continuity_class"),
    },
    { origin: "polar" },
  ),
  f("sleeps.sleepRating", "sleeps", "score", "Лична оценка на сон", {
    polar: doc("Sleep.sleep_rating", "none", "0–5; 0 = не е внесено"),
  }),
  f(
    "sleeps.polarSleepCharge",
    "sleeps",
    "score",
    "Polar Sleep Charge",
    {
      polar: doc("Sleep.sleep_charge", "none", "1–5 споредено со 28 дена"),
    },
    { origin: "polar" },
  ),

  // ===== Overnight recovery / readiness =====
  f("hrv.lastNightAvg", "hrv", "ms", "HRV ноќен просек (RMSSD)", {
    garmin: doc("HRV.lastNightAvg"),
    polar: doc("NightlyRecharge.heart_rate_variability_avg"),
    coros: doc("querySleepHrv (daily average)"),
    suunto: tbc("247 recovery HRV"),
  }),
  f("hrv.hrvValues", "hrv", "series", "HRV низ ноќта", {
    garmin: doc("HRV.hrvValues"),
    polar: doc("NightlyRecharge.hrv_samples"),
    coros: doc("querySleepHrv (raw curve)"),
  }),
  f("hrv.lastNight5MinHigh", "hrv", "ms", "HRV највисок 5-мин.", {
    garmin: doc("HRV.lastNight5MinHigh"),
  }),
  f(
    "hrv.baselineRange",
    "hrv",
    "array",
    "HRV нормален опсег",
    {
      coros: doc("querySleepHrv (normal range)"),
    },
    { note: "За другите вендори ActiveN го пресметува од 7/28-дневна историја." },
  ),
  f("sleeps.averageSleepHeartRate", "sleeps", "bpm", "Ноќен пулс (просек)", {
    polar: doc("NightlyRecharge.heart_rate_avg"),
  }),
  f("sleeps.averageRespirationValue", "sleeps", "brpm", "Ноќно дишење (просек)", {
    polar: doc("NightlyRecharge.breathing_rate_avg"),
    garmin: doc("Sleeps.timeOffsetSleepRespiration", "none", "просек од samples"),
  }),
  f("skin_temp.avgDeviationCelsius", "skin_temp", "c", "Отстапување на температура на кожа", {
    garmin: doc("SkinTemp.avgDeviationCelsius"),
    polar: doc("Biosensing.skintemperature.deviation_from_baseline_celsius"),
  }),
  f(
    "stress_details.timeOffsetBodyBatteryValues",
    "stress_details",
    "series",
    "Garmin Body Battery",
    {
      garmin: doc("StressDetails.timeOffsetBodyBatteryValues (+ activity events)"),
    },
    { origin: "garmin" },
  ),
  f(
    "hrv.polarNightlyRechargeStatus",
    "hrv",
    "score",
    "Polar Nightly Recharge (1–6)",
    {
      polar: doc("NightlyRecharge.nightly_recharge_status"),
    },
    { origin: "polar" },
  ),
  f(
    "hrv.polarAnsCharge",
    "hrv",
    "score",
    "Polar ANS charge (−10…+10)",
    {
      polar: doc("NightlyRecharge.ans_charge / ans_charge_status"),
    },
    { origin: "polar" },
  ),
  f(
    "sleeps.polarAlertness",
    "sleeps",
    "series",
    "Polar SleepWise будност",
    {
      polar: doc("SleepWise.alertness (grade, hourly_data)"),
    },
    { origin: "polar" },
  ),
  f(
    "sleeps.polarCircadianBedtime",
    "sleeps",
    "array",
    "Polar циркадијално време за сон",
    {
      polar: doc("SleepWise.circadian-bedtime (sleep_gate_start/end_time)"),
    },
    { origin: "polar" },
  ),
  f(
    "training_status.corosRecoveryPercent",
    "training_status",
    "pct",
    "COROS опоравок (%)",
    {
      coros: doc("recovery status (percentage, level, time to full recovery)"),
    },
    { origin: "coros" },
  ),
  f(
    "training_status.trainingReadiness",
    "training_status",
    "score",
    "Training Readiness (спремност)",
    {},
    {
      origin: "activen",
      note: "По Garmin принцип: sleep score, recovery time, HRV status, acute load, историја на сон и стрес. 1–100: Prime/High/Moderate/Low/Poor.",
    },
  ),
  f(
    "training_status.hrvStatus",
    "training_status",
    "enum",
    "HRV Status",
    {},
    {
      origin: "activen",
      note: "По Garmin принцип: 7-дневен просек vs личен baseline (Balanced/Unbalanced/Low/Poor/No status).",
    },
  ),
  f(
    "training_status.loadFocus",
    "training_status",
    "array",
    "Training Load Focus",
    {},
    {
      origin: "activen",
      note: "По Garmin принцип: 4-неделна распределба Low aerobic / High aerobic / Anaerobic.",
    },
  ),

  // ===== Stress =====
  f("stress_details.timeOffsetStressLevelValues", "stress_details", "series", "Стрес низ денот", {
    garmin: doc("StressDetails.timeOffsetStressLevelValues", "none", "3-мин. просеци 1–100"),
    coros: doc("queryStressTimeSeries"),
  }),

  // ===== Spot checks (on-demand health measurements) =====
  f("health_snapshot.heartRateAvgValue", "health_snapshot", "bpm", "Мерење: пулс", {
    garmin: doc("HealthSnapshot.heartRateAvgValue"),
    coros: doc("queryHealthCheckTimeSeries (heart rate)"),
  }),
  f("health_snapshot.rmssdAvgValue", "health_snapshot", "ms", "Мерење: HRV (RMSSD)", {
    garmin: doc("HealthSnapshot.rmssdAvgValue"),
    coros: doc("queryHealthCheckTimeSeries (HRV)"),
    polar: doc("Biosensing.ecg.heart_rate_variability_ms"),
  }),
  f("health_snapshot.respirationAvgValue", "health_snapshot", "brpm", "Мерење: дишење", {
    garmin: doc("HealthSnapshot.respirationAvgValue"),
    coros: doc("queryHealthCheckTimeSeries (respiratory rate)"),
  }),
  f("pulse_ox.onDemandSpo2", "pulse_ox", "pct", "Мерење: SpO2", {
    garmin: doc("PulseOx.timeOffsetSpo2Values (onDemand = true)"),
    polar: doc("Biosensing.spo2.blood_oxygen_percent"),
    coros: doc("queryHealthCheckTimeSeries (SpO2)"),
  }),
  f("health_snapshot.stressAvgValue", "health_snapshot", "score", "Мерење: стрес", {
    garmin: doc("HealthSnapshot.stressAvgValue"),
    coros: doc("queryHealthCheckTimeSeries (stress)"),
  }),
  f("health_snapshot.bodyTemperatureInCelsius", "health_snapshot", "c", "Телесна температура", {
    polar: doc("Biosensing.bodytemperature.samples.temperature_celsius"),
  }),
  f(
    "blood_pressure.reading",
    "blood_pressure",
    "mmhg",
    "Крвен притисок",
    {
      garmin: doc("BloodPressure.systolic/diastolic/pulse"),
    },
    { sensitivity: "special" },
  ),
  f(
    "health_snapshot.ecg",
    "health_snapshot",
    "series",
    "ЕКГ",
    {
      polar: doc("Biosensing.ecg"),
    },
    { sensitivity: "special", note: "Медицински податок — надвор од опсегот; не се увезува." },
  ),

  // ===== Body =====
  f("body_comps.weightInGrams", "body_comps", "g", "Тежина", {
    garmin: doc("BodyComps.weightInGrams"),
    polar: doc("PhysicalInfo.weight", "kg_to_g"),
  }),
  f("profile.heightInCentimeters", "profile", "cm", "Висина", {
    polar: doc("PhysicalInfo.height"),
  }),
  f("body_comps.bodyMassIndex", "body_comps", "score", "BMI", {
    garmin: doc("BodyComps.bodyMassIndex"),
  }),
  f("body_comps.bodyFatInPercent", "body_comps", "pct", "Масно ткиво", {
    garmin: doc("BodyComps.bodyFatInPercent"),
  }),
  f("body_comps.bodyWaterInPercent", "body_comps", "pct", "Вода во телото", {
    garmin: doc("BodyComps.bodyWaterInPercent"),
  }),
  f("body_comps.muscleMassInGrams", "body_comps", "g", "Мускулна маса", {
    garmin: doc("BodyComps.muscleMassInGrams"),
  }),
  f("body_comps.boneMassInGrams", "body_comps", "g", "Коскена маса", {
    garmin: doc("BodyComps.boneMassInGrams"),
  }),

  // ===== Fitness & profile =====
  f("user_metrics.vo2Max", "user_metrics", "ml_kg_min", "VO2max (трчање)", {
    garmin: doc("UserMetrics.vo2Max"),
    polar: doc("PhysicalInfo.vo2_max"),
    coros: doc("fitness overview VO2max"),
    suunto: doc("FIT session.estimated_vo2_max", "none", "по тренинг"),
  }),
  f("user_metrics.vo2MaxCycling", "user_metrics", "ml_kg_min", "VO2max (велосипед)", {
    garmin: doc("UserMetrics.vo2MaxCycling"),
  }),
  f("user_metrics.fitnessAge", "user_metrics", "years", "Фитнес возраст", {
    garmin: doc("UserMetrics.fitnessAge"),
  }),
  f(
    "user_metrics.maxHeartRateInBeatsPerMinute",
    "user_metrics",
    "bpm",
    "Максимален пулс (профил)",
    {
      polar: doc("PhysicalInfo.maximum_heart_rate"),
      coros: tbc("user profile max HR"),
      garmin: tbc("FIT user_profile / zones_target.max_heart_rate"),
    },
  ),
  f("user_metrics.aerobicThresholdHeartRate", "user_metrics", "bpm", "Аеробен праг (пулс)", {
    polar: doc("PhysicalInfo.aerobic_threshold"),
    suunto: doc("FIT session.aerobic_threshold"),
  }),
  f(
    "user_metrics.lactateThresholdHeartRate",
    "user_metrics",
    "bpm",
    "Анаеробен / лактатен праг (пулс)",
    {
      polar: doc("PhysicalInfo.anaerobic_threshold"),
      suunto: doc("FIT session.anaerobic_threshold"),
      coros: tbc("lactate threshold HR (lthr)"),
      garmin: tbc("FIT zones_target.threshold_heart_rate"),
    },
  ),
  f(
    "user_metrics.lactateThresholdPaceInSecondsPerKilometer",
    "user_metrics",
    "s_per_km",
    "Прагово темпо",
    {
      coros: doc("fitness overview threshold pace"),
    },
  ),
  f(
    "user_metrics.racePredictorTimes",
    "user_metrics",
    "array",
    "Предвидени времиња (5к/10к/полу/маратон)",
    {
      coros: doc("fitness overview race predictions"),
    },
    { note: "ActiveN исто така пресметува сопствена предикција (вендор-независна)." },
  ),
  f("user_metrics.functionalThresholdPowerInWatts", "user_metrics", "w", "FTP", {
    coros: tbc("cycling FTP"),
    garmin: tbc("FIT zones_target.functional_threshold_power"),
  }),
  f(
    "user_metrics.corosRunningFitness",
    "user_metrics",
    "score",
    "COROS Running Fitness",
    {
      coros: doc("fitness overview running level"),
    },
    { origin: "coros" },
  ),
  f(
    "user_metrics.corosStamina",
    "user_metrics",
    "score",
    "COROS Base Fitness / Stamina",
    {
      coros: tbc("stamina_level"),
    },
    { origin: "coros" },
  ),

  // ===== Training load (period) =====
  f(
    "training_status.acuteLoad",
    "training_status",
    "score",
    "Acute Load (краткорочно оптоварување)",
    {
      polar: doc("CardioLoad.strain"),
      coros: doc("training load: short-term load"),
    },
    { note: "Различни скали; ActiveN пресметува сопствено acute/chronic од TRIMP." },
  ),
  f("training_status.chronicLoad", "training_status", "score", "Долгорочно оптоварување", {
    polar: doc("CardioLoad.tolerance"),
    coros: doc("training load: long-term load"),
  }),
  f("training_status.loadRatio", "training_status", "score", "Однос акутно/хронично", {
    polar: doc("CardioLoad.cardio_load_ratio"),
    coros: doc("training load: ratio"),
  }),
  f("training_status.trainingStatus", "training_status", "enum", "Training Status", {
    polar: doc("CardioLoad.cardio_load_status"),
    coros: doc("training load: daily commentary / recovery level"),
  }),

  // ===== Profile =====
  f("profile.birthDate", "profile", "date", "Датум на раѓање", {
    polar: doc("PhysicalInfo.birthday"),
  }),
  f("profile.gender", "profile", "enum", "Пол", { polar: doc("PhysicalInfo.gender") }),
  f("profile.trainingBackground", "profile", "enum", "Тренинг позадина", {
    polar: doc("PhysicalInfo.training_background"),
  }),
  f("profile.sleepGoalInSeconds", "profile", "s", "Цел за сон", {
    polar: doc("PhysicalInfo.sleep_goal", "iso_duration_to_s"),
  }),

  // ===== Planned workout (write) =====
  f(
    "workouts.workout",
    "workouts",
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
  f("workouts.scheduledDate", "workouts", "date", "Закажан датум", {
    garmin: doc("Training API schedule: scheduledDate"),
    coros: doc("training calendar"),
  }),

  // ===== Routes (write) =====
  f("courses.course", "courses", "array", "Рута (GPX/курс)", {
    garmin: doc("Courses API"),
    coros: doc("GPX route import/export"),
    suunto: tbc("route upload"),
  }),
]);
