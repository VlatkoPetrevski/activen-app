# Каталог на податоци — полиња и мапирање

> **Генериран документ** од `packages/domain/src/catalog/fields.ts` — не се уредува рачно.
> Објаснувањето и одлуките се во [data-catalog.md](data-catalog.md).

Легенда: ✅ потврдено во јавна документација · 🟦 стандардно поле во FIT профилот · ❓ намената е позната, името/единицата треба да се потврди во партнерската документација · — нема.

## Покриеност по вендор

| Вендор | ✅ | 🟦 | ❓ | Заеднички полиња без податок |
| --- | --- | --- | --- | --- |
| Garmin | 97 | 20 | 5 | 29 |
| Polar | 82 | 0 | 2 | 76 |
| Suunto | 14 | 47 | 5 | 86 |
| COROS | 24 | 47 | 25 | 57 |

Вкупно канонски полиња: **171**.

## Активност (резиме)

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `activity.external_id` | id | ID кај изворот | заедничко | ✅ `Activities.summaryId`<br>_activityId = ID во Garmin Connect_ | ✅ `Exercise.id` | ❓ `Workout.workoutKey` | ❓ `getWorkoutRecords.labelId` |
| `activity.start_time` | datetime | Почеток | заедничко | ✅ `Activities.startTimeInSeconds` ⟶ epoch_s_to_iso | ✅ `Exercise.start_time`<br>_локално време + start_time_utc_offset_ | 🟦 `FIT session.start_time` | 🟦 `FIT session.start_time` |
| `activity.utc_offset_s` | s | Временска зона (поместување) | заедничко | ✅ `Activities.startTimeOffsetInSeconds` | ❓ `Exercise.start_time_utc_offset`<br>_веројатно во минути_ | 🟦 `FIT activity.local_timestamp − timestamp` | 🟦 `FIT activity.local_timestamp − timestamp` |
| `activity.name` | text | Име на активност | заедничко | ✅ `Activities.activityName` | — | 🟦 `FIT session.description (developer field)` | ❓ `getWorkoutRecords.name` |
| `activity.sport` | enum | Спорт | заедничко | ✅ `Activities.activityType`<br>_see catalog/sports.ts_ | ✅ `Exercise.sport + detailed_sport_info` | 🟦 `FIT session.sport + sub_sport` | 🟦 `FIT session.sport + sub_sport` |
| `activity.device` | text | Уред | заедничко | ✅ `Activities.deviceName` | ✅ `Exercise.device` | 🟦 `FIT file_id.product_name` | 🟦 `FIT file_id.product_name` |
| `activity.elapsed_time_s` | s | Вкупно време (elapsed) | заедничко | ✅ `Activities.durationInSeconds` | ✅ `Exercise.duration` ⟶ iso_duration_to_s | 🟦 `FIT session.total_elapsed_time` | 🟦 `FIT session.total_elapsed_time` |
| `activity.timer_time_s` | s | Време без паузи | заедничко | ✅ `ActivityDetails.samples[-1].timerDurationInSeconds` | — | 🟦 `FIT session.total_timer_time` | 🟦 `FIT session.total_timer_time` |
| `activity.moving_time_s` | s | Време во движење | заедничко | ✅ `ActivityDetails.samples[-1].movingDurationInSeconds` | — | — | — |
| `activity.distance_m` | m | Растојание | заедничко | ✅ `Activities.distanceInMeters` | ✅ `Exercise.distance` | 🟦 `FIT session.total_distance` | 🟦 `FIT session.total_distance` |
| `activity.avg_speed_ms` | m_s | Просечна брзина | заедничко | ✅ `Activities.averageSpeedInMetersPerSecond` | — | 🟦 `FIT session.avg_speed (enhanced_avg_speed)` | 🟦 `FIT session.avg_speed (enhanced_avg_speed)` |
| `activity.max_speed_ms` | m_s | Максимална брзина | заедничко | ✅ `Activities.maxSpeedInMetersPerSecond` | — | 🟦 `FIT session.max_speed` | 🟦 `FIT session.max_speed` |
| `activity.avg_pace_s_per_km` | s_per_km | Просечно темпо (од вендор)<br>_ActiveN го пресметува темпото од elapsed time / растојание; ова е само за споредба._ | заедничко | ✅ `Activities.averagePaceInMinutesPerKilometer` ⟶ min_per_km_to_s_per_km | — | — | — |
| `activity.elevation_gain_m` | m | Искачување | заедничко | ✅ `Activities.totalElevationGainInMeters` | ❓ `Exercise TCX/samples type 3 (altitude)`<br>_нема поле во summary; се пресметува_ | 🟦 `FIT session.total_ascent` | 🟦 `FIT session.total_ascent` |
| `activity.elevation_loss_m` | m | Спуштање | заедничко | ✅ `Activities.totalElevationLossInMeters` | — | 🟦 `FIT session.total_descent` | 🟦 `FIT session.total_descent` |
| `activity.avg_hr` | bpm | Просечен пулс | заедничко | ✅ `Activities.averageHeartRateInBeatsPerMinute` | ✅ `Exercise.heart_rate.average` | 🟦 `FIT session.avg_heart_rate` | 🟦 `FIT session.avg_heart_rate` |
| `activity.max_hr` | bpm | Максимален пулс | заедничко | ✅ `Activities.maxHeartRateInBeatsPerMinute` | ✅ `Exercise.heart_rate.maximum` | 🟦 `FIT session.max_heart_rate` | 🟦 `FIT session.max_heart_rate` |
| `activity.min_hr` | bpm | Минимален пулс | заедничко | — | — | 🟦 `FIT session.min_heart_rate` | 🟦 `FIT session.min_heart_rate` |
| `activity.calories_kcal` | kcal | Калории | заедничко | ✅ `Activities.activeKilocalories`<br>_изворите не се согласуваат дали вклучува BMR_ | ✅ `Exercise.calories` | 🟦 `FIT session.total_calories` | 🟦 `FIT session.total_calories` |
| `activity.steps` | count | Чекори | заедничко | ✅ `Activities.steps` | — | — | — |
| `activity.avg_run_cadence_spm` | spm | Каденца трчање (просек) | заедничко | ✅ `Activities.averageRunCadenceInStepsPerMinute` | — | 🟦 `FIT session.avg_cadence (+avg_fractional_cadence)`<br>_FIT за трчање често е по нога — проверка ×2_ | 🟦 `FIT session.avg_cadence (+avg_fractional_cadence)`<br>_FIT за трчање често е по нога — проверка ×2_ |
| `activity.max_run_cadence_spm` | spm | Каденца трчање (макс.) | заедничко | ✅ `Activities.maxRunCadenceInStepsPerMinute` | — | 🟦 `FIT session.max_cadence`<br>_FIT за трчање често е по нога — проверка ×2_ | 🟦 `FIT session.max_cadence`<br>_FIT за трчање често е по нога — проверка ×2_ |
| `activity.avg_bike_cadence_rpm` | rpm | Каденца велосипед (просек) | заедничко | ✅ `Activities.averageBikeCadenceInRoundsPerMinute` | — | 🟦 `FIT session.avg_cadence` | 🟦 `FIT session.avg_cadence` |
| `activity.max_bike_cadence_rpm` | rpm | Каденца велосипед (макс.) | заедничко | ✅ `Activities.maxBikeCadenceInRoundsPerMinute` | — | 🟦 `FIT session.max_cadence` | 🟦 `FIT session.max_cadence` |
| `activity.avg_power_w` | w | Просечна моќност | заедничко | 🟦 `FIT session.avg_power` | ✅ `ExerciseSamples type 4 (power)`<br>_просек од samples_ | 🟦 `FIT session.avg_power` | 🟦 `FIT session.avg_power` |
| `activity.max_power_w` | w | Максимална моќност | заедничко | 🟦 `FIT session.max_power` | — | 🟦 `FIT session.max_power` | 🟦 `FIT session.max_power` |
| `activity.normalized_power_w` | w | Нормализирана моќност | заедничко | 🟦 `FIT session.normalized_power` | — | — | 🟦 `FIT session.normalized_power` |
| `activity.avg_temperature_c` | c | Просечна температура | заедничко | ✅ `ActivityDetails.samples.airTemperatureCelcius`<br>_просек од samples_ | — | 🟦 `FIT session.avg_temperature` | 🟦 `FIT session.avg_temperature` |
| `activity.start_lat` | deg | Почетна ширина<br>_Локација — не се прикажува на тренер без согласност._ 🔒 | заедничко | ✅ `Activities.startingLatitudeInDegree` | ✅ `Exercise.route[0].latitude` | 🟦 `FIT session.start_position_lat`<br>_семикругови → степени во FIT декодерот_ | 🟦 `FIT session.start_position_lat`<br>_семикругови → степени во FIT декодерот_ |
| `activity.start_lon` | deg | Почетна должина 🔒 | заедничко | ✅ `Activities.startingLongitudeInDegree` | ✅ `Exercise.route[0].longitude` | 🟦 `FIT session.start_position_long`<br>_семикругови → степени во FIT декодерот_ | 🟦 `FIT session.start_position_long`<br>_семикругови → степени во FIT декодерот_ |
| `activity.has_route` | bool | Има GPS рута | заедничко | — | ✅ `Exercise.has_route` | — | — |
| `activity.is_manual` | bool | Рачно внесена/изменета | заедничко | ✅ `Activities.manual` | — | — | — |
| `activity.parent_id` | id | Мултиспорт родител | заедничко | ✅ `Activities.parentSummaryId` | — | — | — |
| `activity.pool_length_m` | m | Должина на базен | заедничко | 🟦 `FIT session.pool_length` | — | 🟦 `FIT session.pool_length` | 🟦 `FIT session.pool_length` |
| `activity.active_lengths` | count | Пливани должини | заедничко | ✅ `Activities.numberOfActiveLengths` | — | 🟦 `FIT session.num_active_lengths` | 🟦 `FIT session.num_active_lengths` |
| `activity.avg_swim_cadence_spm` | spm | Каденца пливање | заедничко | ✅ `Activities.averageSwimCadenceInStrokesPerMinute` | — | 🟦 `FIT length.avg_swimming_cadence` | — |
| `activity.avg_swolf` | score | SWOLF | заедничко | — | — | ✅ `FIT session.avg_swolf` | — |
| `activity.time_in_hr_zones_s` | array | Време по HR зони | заедничко | 🟦 `FIT session.time_in_hr_zone` | ✅ `Exercise.heart_rate_zones[].in-zone` ⟶ iso_duration_to_s | 🟦 `FIT session.time_in_hr_zone` | 🟦 `FIT session.time_in_hr_zone` |
| `activity.hr_zone_bounds` | array | Граници на HR зони од вендорот<br>_Извор за увоз на HR зони (zonesFromLowerBounds)._ | заедничко | — | ✅ `Exercise.heart_rate_zones[].lower-limit/upper-limit` | ✅ `FIT session.aerobic_threshold / anaerobic_threshold` | — |
| `activity.rpe` | score | Субјективен напор (RPE)<br>_Канонска скала 1–10; рачно внесување во ActiveN е примарен извор._ | заедничко | — | ✅ `Exercise.training_load_pro.user-rpe` | — | ❓ `workout feedback` |
| `activity.feeling` | score | Чувство (1–5)<br>_Се спојува со внесот „како се чувствуваш“ во ActiveN._ | заедничко | — | — | ✅ `FIT session.feeling`<br>_1 = најлошо, 5 = најдобро_ | — |
| `activity.aerobic_training_effect` | score | Аеробен ефект (0–5) | заедничко | 🟦 `FIT session.total_training_effect` | — | ✅ `FIT session.total_training_effect`<br>_Suunto: PTE_ | ❓ `FIT session.total_training_effect` |
| `activity.anaerobic_training_effect` | score | Анаеробен ефект (0–5) | заедничко | 🟦 `FIT session.total_anaerobic_training_effect` | — | — | ❓ `FIT session.total_anaerobic_training_effect` |
| `activity.recovery_time_s` | s | Препорачано време за опоравок | заедничко | ❓ `FIT (Garmin developer data)` | — | ✅ `FIT session.recovery_time` | ❓ `workout summary` |
| `activity.vo2max_estimate` | ml_kg_min | VO2max проценка (по тренинг) | заедничко | — | — | ✅ `FIT session.estimated_vo2_max` | — |
| `activity.avg_ground_contact_ms` | ms | Контакт со подлога | заедничко | 🟦 `FIT session.avg_stance_time` | — | — | ❓ `FIT session.avg_stance_time` |
| `activity.avg_vertical_oscillation_mm` | mm | Вертикална осцилација | заедничко | 🟦 `FIT session.avg_vertical_oscillation` | — | — | ❓ `FIT session.avg_vertical_oscillation` |
| `activity.avg_stride_length_mm` | mm | Должина на чекор | заедничко | 🟦 `FIT session.avg_step_length` | — | — | ❓ `FIT session.avg_step_length` |
| `activity.polar_running_index` | score | Polar Running Index | Polar (своја метрика) | — | ✅ `Exercise.running-index` | — | — |
| `activity.polar_energy_sources_pct` | array | Извори на енергија (масти/јаглехидрати/протеини) | Polar (своја метрика) | — | ✅ `Exercise.fat_percentage / carbohydrate_percentage / protein_percentage` | — | — |
| `activity.polar_cardio_load` | score | Polar Cardio Load | Polar (своја метрика) | — | ✅ `Exercise.training_load_pro.cardio-load` | — | — |
| `activity.polar_muscle_load` | score | Polar Muscle Load | Polar (своја метрика) | — | ✅ `Exercise.training_load_pro.muscle-load` | — | — |
| `activity.polar_perceived_load` | score | Polar Perceived Load | Polar (своја метрика) | — | ✅ `Exercise.training_load_pro.perceived-load` | — | — |
| `activity.garmin_training_load` | score | Garmin Training Load | Garmin (своја метрика) | ❓ `FIT session.training_load_peak` | — | — | — |
| `activity.suunto_tss` | score | Suunto TSS | Suunto (своја метрика) | — | — | ✅ `Workout.tss / tssList` | — |
| `activity.suunto_peak_epoc` | score | Suunto EPOC | Suunto (своја метрика) | — | — | ✅ `FIT session.peak_epoc` | — |
| `activity.coros_training_load` | score | COROS Training Load | COROS (своја метрика) | — | — | — | ❓ `workout summary trainingLoad` |
| `activity.trimp` | score | TRIMP (ActiveN)<br>_Независен од вендор, пресметан од пулс и време; основа за споредба и оптоварување._ | ActiveN | — | — | — | — |

## Кругови

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `lap.start_time` | datetime | Почеток на круг | заедничко | ✅ `ActivityDetails.laps[].startTimeInSeconds` ⟶ epoch_s_to_iso | — | 🟦 `FIT lap.start_time` | 🟦 `FIT lap.start_time` |
| `lap.elapsed_time_s` | s | Време на круг | заедничко | 🟦 `FIT lap.total_elapsed_time` | — | 🟦 `FIT lap.total_elapsed_time` | 🟦 `FIT lap.total_elapsed_time` |
| `lap.distance_m` | m | Растојание на круг | заедничко | 🟦 `FIT lap.total_distance` | — | 🟦 `FIT lap.total_distance` | 🟦 `FIT lap.total_distance` |
| `lap.avg_hr` | bpm | Просечен пулс (круг) | заедничко | 🟦 `FIT lap.avg_heart_rate` | — | 🟦 `FIT lap.avg_heart_rate` | 🟦 `FIT lap.avg_heart_rate` |
| `lap.max_hr` | bpm | Макс. пулс (круг) | заедничко | 🟦 `FIT lap.max_heart_rate` | — | 🟦 `FIT lap.max_heart_rate` | 🟦 `FIT lap.max_heart_rate` |
| `lap.avg_speed_ms` | m_s | Брзина (круг) | заедничко | 🟦 `FIT lap.avg_speed` | — | 🟦 `FIT lap.avg_speed` | 🟦 `FIT lap.avg_speed` |
| `lap.avg_power_w` | w | Моќност (круг) | заедничко | 🟦 `FIT lap.avg_power` | — | 🟦 `FIT lap.avg_power` | 🟦 `FIT lap.avg_power` |
| `lap.avg_cadence` | spm | Каденца (круг) | заедничко | 🟦 `FIT lap.avg_cadence` | — | 🟦 `FIT lap.avg_cadence` | 🟦 `FIT lap.avg_cadence` |
| `lap.ascent_m` | m | Искачување (круг) | заедничко | 🟦 `FIT lap.total_ascent` | — | 🟦 `FIT lap.total_ascent` | 🟦 `FIT lap.total_ascent` |
| `lap.trigger` | enum | Причина за круг | заедничко | 🟦 `FIT lap.lap_trigger` | — | 🟦 `FIT lap.lap_trigger` | 🟦 `FIT lap.lap_trigger` |

## Временски серии (samples)

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `stream.time` | series | Време | заедничко | ✅ `ActivityDetails.samples.startTimeInSeconds` | ✅ `ExerciseSamples.recording-rate`<br>_временска оска од recording-rate_ | 🟦 `FIT record.timestamp` | 🟦 `FIT record.timestamp` |
| `stream.position` | series | GPS позиција 🔒 | заедничко | ✅ `ActivityDetails.samples.latitudeInDegree/longitudeInDegree` | ✅ `Exercise.route[].latitude/longitude` | 🟦 `FIT record.position_lat/position_long` | 🟦 `FIT record.position_lat/position_long` |
| `stream.altitude_m` | series | Надморска висина | заедничко | ✅ `ActivityDetails.samples.elevationInMeters` | ✅ `ExerciseSamples type 3` | 🟦 `FIT record.altitude` | 🟦 `FIT record.altitude` |
| `stream.heart_rate` | series | Пулс | заедничко | ✅ `ActivityDetails.samples.heartrate` | ✅ `ExerciseSamples type 0` | 🟦 `FIT record.heart_rate` | 🟦 `FIT record.heart_rate` |
| `stream.speed_ms` | series | Брзина | заедничко | ✅ `ActivityDetails.samples.speedMetersPerSecond` | ✅ `ExerciseSamples type 1` ⟶ kmh_to_ms | 🟦 `FIT record.speed` | 🟦 `FIT record.speed` |
| `stream.distance_m` | series | Растојание | заедничко | ✅ `ActivityDetails.samples.totalDistanceInMeters` | ✅ `ExerciseSamples type 10` | 🟦 `FIT record.distance` | 🟦 `FIT record.distance` |
| `stream.cadence` | series | Каденца | заедничко | ✅ `ActivityDetails.samples.stepsPerMinute / bikeCadenceInRPM` | ✅ `ExerciseSamples type 2 (rpm) / 8 (spm)` | 🟦 `FIT record.cadence` | 🟦 `FIT record.cadence` |
| `stream.power_w` | series | Моќност | заедничко | ✅ `ActivityDetails.samples.powerInWatts` | ✅ `ExerciseSamples type 4` | 🟦 `FIT record.power` | 🟦 `FIT record.power` |
| `stream.temperature_c` | series | Температура | заедничко | ✅ `ActivityDetails.samples.airTemperatureCelcius` | ✅ `ExerciseSamples type 9` | — | 🟦 `FIT record.temperature` |
| `stream.rr_interval_ms` | series | RR интервали | заедничко | 🟦 `FIT hrv.time` | ✅ `ExerciseSamples type 11`<br>_само со H6/H7/H9/H10 сензор_ | ✅ `FIT hrv.time`<br>_во секунди во FIT_ | — |
| `stream.suunto_epoc` | series | EPOC (тек) | Suunto (своја метрика) | — | — | ✅ `FIT record.epoc` | — |

## Дневно резиме

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `daily.steps` | count | Чекори 🔒 | заедничко | ✅ `Dailies.steps` | ✅ `DailyActivity.steps` | ❓ `247 activity steps` | ❓ `getDailyData.steps` |
| `daily.distance_m` | m | Дневно растојание 🔒 | заедничко | ✅ `Dailies.distanceInMeters` | ✅ `DailyActivity.distance_from_steps` | — | — |
| `daily.active_kcal` | kcal | Активни калории 🔒 | заедничко | ✅ `Dailies.activeKilocalories` | ✅ `DailyActivity.active_calories` | — | ❓ `getDailyData.calories` |
| `daily.bmr_kcal` | kcal | Базални калории (BMR) 🔒 | заедничко | ✅ `Dailies.bmrKilocalories` | — | — | — |
| `daily.total_kcal` | kcal | Вкупно калории<br>_Garmin: active + BMR._ 🔒 | заедничко | — | ✅ `DailyActivity.calories` | — | — |
| `daily.active_time_s` | s | Активно време 🔒 | заедничко | ✅ `Dailies.activeTimeInSeconds` | ✅ `DailyActivity.active_duration` ⟶ iso_duration_to_s | — | — |
| `daily.inactive_time_s` | s | Неактивно време 🔒 | заедничко | — | ✅ `DailyActivity.inactive_duration` ⟶ iso_duration_to_s | — | — |
| `daily.moderate_intensity_s` | s | Умерен интензитет 🔒 | заедничко | ✅ `Dailies.moderateIntensityDurationInSeconds` | — | — | — |
| `daily.vigorous_intensity_s` | s | Висок интензитет 🔒 | заедничко | ✅ `Dailies.vigorousIntensityDurationInSeconds` | — | — | — |
| `daily.floors` | count | Искачени катови 🔒 | заедничко | ✅ `Dailies.floorsClimbed` | — | — | — |
| `daily.resting_hr` | bpm | Пулс во мирување 🔒 | заедничко | ✅ `Dailies.restingHeartRateInBeatsPerMinute` | ✅ `PhysicalInfo.resting_heart_rate`<br>_профилна вредност, не дневна_ | — | ✅ `queryRestingHeartRate` |
| `daily.min_hr` | bpm | Мин. пулс (ден) 🔒 | заедничко | ✅ `Dailies.minHeartRateInBeatsPerMinute` | — | — | — |
| `daily.max_hr` | bpm | Макс. пулс (ден) 🔒 | заедничко | ✅ `Dailies.maxHeartRateInBeatsPerMinute` | — | — | — |
| `daily.avg_hr` | bpm | Просечен пулс (ден) 🔒 | заедничко | ✅ `Dailies.averageHeartRateInBeatsPerMinute`<br>_Garmin: просек на последните 7 дена_ | — | — | ✅ `queryAvgHeartRate` |
| `daily.avg_stress` | score | Просечен стрес 🔒 | заедничко | ✅ `Dailies.averageStressLevel`<br>_1–100; −1 = недоволно податоци_ | — | — | ✅ `queryStressLevel` |
| `daily.max_stress` | score | Макс. стрес 🔒 | заедничко | ✅ `Dailies.maxStressLevel` | — | — | — |
| `daily.stress_durations_s` | array | Време по стрес нивоа 🔒 | заедничко | ✅ `Dailies.rest/low/medium/highStressDurationInSeconds` | — | — | — |
| `daily.steps_goal` | count | Цел за чекори 🔒 | заедничко | ✅ `Dailies.stepsGoal` | — | — | — |

## Низ денот

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `intraday.heart_rate` | series | Пулс низ денот 🔒 | заедничко | ✅ `Dailies.timeOffsetHeartRateSamples` | ✅ `ContinuousHeartRate.heart_rate_samples`<br>_5-минутни вредности_ | — | ❓ `heart rate time series` |
| `intraday.activity_epochs` | series | Активност по интервали 🔒 | заедничко | ✅ `Epochs (15 min): activityType, met, intensity, steps` | ✅ `DailyActivity.samples.activity_zones` | — | — |
| `intraday.respiration` | series | Дишење низ денот 🔒 | заедничко | ✅ `Respiration.timeOffsetEpochToBreaths` | — | — | — |
| `intraday.spo2` | series | SpO2 низ денот 🔒 | заедничко | ✅ `PulseOx.timeOffsetSpo2Values` | — | — | — |

## Сон

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sleep.start_time` | datetime | Почеток на сон 🔒 | заедничко | ✅ `Sleeps.startTimeInSeconds` ⟶ epoch_s_to_iso | ✅ `Sleep.sleep_start_time` | ❓ `247 sleep`<br>_Suunto FAQ: сонот можеби не е достапен преку Cloud API_ | ❓ `sleep start` |
| `sleep.end_time` | datetime | Крај на сон<br>_Garmin: start + duration + awake._ 🔒 | заедничко | — | ✅ `Sleep.sleep_end_time` | — | ❓ `sleep end` |
| `sleep.duration_s` | s | Времетраење на сон 🔒 | заедничко | ✅ `Sleeps.durationInSeconds` | ✅ `Sleep light+deep+rem` | — | ❓ `sleep total` |
| `sleep.deep_s` | s | Длабок сон 🔒 | заедничко | ✅ `Sleeps.deepSleepDurationInSeconds` | ✅ `Sleep.deep_sleep` | — | ❓ `sleep deep` |
| `sleep.light_s` | s | Лесен сон 🔒 | заедничко | ✅ `Sleeps.lightSleepDurationInSeconds` | ✅ `Sleep.light_sleep` | — | ❓ `sleep light` |
| `sleep.rem_s` | s | REM сон 🔒 | заедничко | ✅ `Sleeps.remSleepInSeconds` | ✅ `Sleep.rem_sleep` | — | ❓ `sleep rem` |
| `sleep.awake_s` | s | Будност / прекини 🔒 | заедничко | ✅ `Sleeps.awakeDurationInSeconds` | ✅ `Sleep.total_interruption_duration` | — | ❓ `sleep awake` |
| `sleep.unmeasured_s` | s | Неизмерен сон 🔒 | заедничко | ✅ `Sleeps.unmeasurableSleepInSeconds` | ✅ `Sleep.unrecognized_sleep_stage` | — | — |
| `sleep.score` | score | Оценка на сон (0–100)<br>_Различни алгоритми; се прикажува со извор, не се усреднува меѓу вендори._ 🔒 | заедничко | ✅ `Sleeps.overallSleepScore.value` | ✅ `Sleep.sleep_score` | — | ❓ `sleep score` |
| `sleep.hypnogram` | series | Фази на сон (хипнограм) 🔒 | заедничко | ✅ `Sleeps.sleepLevelsMap (deep/light/rem/awake)` | ✅ `Sleep.hypnogram`<br>_0 будност, 1 REM, 2–3 лесен, 4 длабок, 5 непознато_ | — | — |
| `sleep.heart_rate` | series | Пулс во сон 🔒 | заедничко | — | ✅ `Sleep.heart_rate_samples` | — | — |
| `sleep.respiration` | series | Дишење во сон 🔒 | заедничко | ✅ `Sleeps.timeOffsetSleepRespiration` | — | — | — |
| `sleep.spo2` | series | SpO2 во сон 🔒 | заедничко | ✅ `Sleeps.timeOffsetSleepSpo2` | — | — | — |
| `sleep.naps` | array | Дремки 🔒 | заедничко | ✅ `Sleeps.naps` | — | — | — |
| `sleep.cycles` | count | Циклуси на сон 🔒 | заедничко | — | ✅ `Sleep.sleep_cycles` | — | — |
| `sleep.continuity` | score | Континуитет 🔒 | Polar (своја метрика) | — | ✅ `Sleep.continuity / continuity_class` | — | — |
| `sleep.user_rating` | score | Лична оценка на сон 🔒 | заедничко | — | ✅ `Sleep.sleep_rating`<br>_0–5; 0 = не е внесено_ | — | — |
| `sleep.polar_sleep_charge` | score | Polar Sleep Charge 🔒 | Polar (своја метрика) | — | ✅ `Sleep.sleep_charge`<br>_1–5 споредено со 28 дена_ | — | — |

## Ноќен опоравок и спремност

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `recovery.hrv_rmssd_ms` | ms | HRV ноќен просек (RMSSD) 🔒 | заедничко | ✅ `HRV.lastNightAvg` | ✅ `NightlyRecharge.heart_rate_variability_avg` | ❓ `247 recovery HRV` | ✅ `querySleepHrv (daily average)` |
| `recovery.hrv_samples` | series | HRV низ ноќта 🔒 | заедничко | ✅ `HRV.hrvValues` | ✅ `NightlyRecharge.hrv_samples` | — | ✅ `querySleepHrv (raw curve)` |
| `recovery.hrv_5min_high_ms` | ms | HRV највисок 5-мин. 🔒 | заедничко | ✅ `HRV.lastNight5MinHigh` | — | — | — |
| `recovery.hrv_baseline_range` | array | HRV нормален опсег<br>_За другите вендори ActiveN го пресметува од 7/28-дневна историја._ 🔒 | заедничко | — | — | — | ✅ `querySleepHrv (normal range)` |
| `recovery.night_hr_avg` | bpm | Ноќен пулс (просек) 🔒 | заедничко | — | ✅ `NightlyRecharge.heart_rate_avg` | — | — |
| `recovery.night_breathing_rate` | brpm | Ноќно дишење (просек) 🔒 | заедничко | ✅ `Sleeps.timeOffsetSleepRespiration`<br>_просек од samples_ | ✅ `NightlyRecharge.breathing_rate_avg` | — | — |
| `recovery.skin_temp_deviation_c` | c | Отстапување на температура на кожа 🔒 | заедничко | ✅ `SkinTemp.avgDeviationCelsius` | ✅ `Biosensing.skintemperature.deviation_from_baseline_celsius` | — | — |
| `recovery.garmin_body_battery` | series | Garmin Body Battery 🔒 | Garmin (своја метрика) | ✅ `StressDetails.timeOffsetBodyBatteryValues (+ activity events)` | — | — | — |
| `recovery.polar_nightly_recharge` | score | Polar Nightly Recharge (1–6) 🔒 | Polar (своја метрика) | — | ✅ `NightlyRecharge.nightly_recharge_status` | — | — |
| `recovery.polar_ans_charge` | score | Polar ANS charge (−10…+10) 🔒 | Polar (своја метрика) | — | ✅ `NightlyRecharge.ans_charge / ans_charge_status` | — | — |
| `recovery.polar_alertness` | series | Polar SleepWise будност 🔒 | Polar (своја метрика) | — | ✅ `SleepWise.alertness (grade, hourly_data)` | — | — |
| `recovery.polar_circadian_bedtime` | array | Polar циркадијално време за сон 🔒 | Polar (своја метрика) | — | ✅ `SleepWise.circadian-bedtime (sleep_gate_start/end_time)` | — | — |
| `recovery.coros_recovery_pct` | pct | COROS опоравок (%) 🔒 | COROS (своја метрика) | — | — | — | ✅ `recovery status (percentage, level, time to full recovery)` |
| `recovery.readiness` | score | Спремност (ActiveN)<br>_Утринска оценка од HRV vs baseline, пулс во мирување, сон и оптоварување — за брифингот._ 🔒 | ActiveN | — | — | — | — |

## Стрес

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `stress.samples` | series | Стрес низ денот 🔒 | заедничко | ✅ `StressDetails.timeOffsetStressLevelValues`<br>_3-мин. просеци 1–100_ | — | — | ✅ `queryStressTimeSeries` |

## Моментални мерења

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `spot.heart_rate` | bpm | Мерење: пулс 🔒 | заедничко | ✅ `HealthSnapshot.heartRateAvgValue` | — | — | ✅ `queryHealthCheckTimeSeries (heart rate)` |
| `spot.hrv_rmssd_ms` | ms | Мерење: HRV (RMSSD) 🔒 | заедничко | ✅ `HealthSnapshot.rmssdAvgValue` | ✅ `Biosensing.ecg.heart_rate_variability_ms` | — | ✅ `queryHealthCheckTimeSeries (HRV)` |
| `spot.respiration` | brpm | Мерење: дишење 🔒 | заедничко | ✅ `HealthSnapshot.respirationAvgValue` | — | — | ✅ `queryHealthCheckTimeSeries (respiratory rate)` |
| `spot.spo2_pct` | pct | Мерење: SpO2 🔒 | заедничко | ✅ `PulseOx.timeOffsetSpo2Values (onDemand = true)` | ✅ `Biosensing.spo2.blood_oxygen_percent` | — | ✅ `queryHealthCheckTimeSeries (SpO2)` |
| `spot.stress` | score | Мерење: стрес 🔒 | заедничко | ✅ `HealthSnapshot.stressAvgValue` | — | — | ✅ `queryHealthCheckTimeSeries (stress)` |
| `spot.body_temperature_c` | c | Телесна температура 🔒 | заедничко | — | ✅ `Biosensing.bodytemperature.samples.temperature_celsius` | — | — |
| `spot.blood_pressure` | mmhg | Крвен притисок 🔒🔒 | заедничко | ✅ `BloodPressure.systolic/diastolic/pulse` | — | — | — |
| `spot.ecg` | series | ЕКГ<br>_Медицински податок — надвор од опсегот; не се увезува._ 🔒🔒 | заедничко | — | ✅ `Biosensing.ecg` | — | — |

## Тело

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `body.weight_kg` | kg | Тежина 🔒 | заедничко | ✅ `BodyComps.weightInGrams` ⟶ g_to_kg | ✅ `PhysicalInfo.weight` | — | — |
| `body.height_cm` | cm | Висина 🔒 | заедничко | — | ✅ `PhysicalInfo.height` | — | — |
| `body.bmi` | score | BMI 🔒 | заедничко | ✅ `BodyComps.bodyMassIndex` | — | — | — |
| `body.fat_pct` | pct | Масно ткиво 🔒 | заедничко | ✅ `BodyComps.bodyFatInPercent` | — | — | — |
| `body.water_pct` | pct | Вода во телото 🔒 | заедничко | ✅ `BodyComps.bodyWaterInPercent` | — | — | — |
| `body.muscle_mass_kg` | kg | Мускулна маса 🔒 | заедничко | ✅ `BodyComps.muscleMassInGrams` ⟶ g_to_kg | — | — | — |
| `body.bone_mass_kg` | kg | Коскена маса 🔒 | заедничко | ✅ `BodyComps.boneMassInGrams` ⟶ g_to_kg | — | — | — |

## Фитнес метрики

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `fitness.vo2max_running` | ml_kg_min | VO2max (трчање) 🔒 | заедничко | ✅ `UserMetrics.vo2Max` | ✅ `PhysicalInfo.vo2_max` | ✅ `FIT session.estimated_vo2_max`<br>_по тренинг_ | ✅ `fitness overview VO2max` |
| `fitness.vo2max_cycling` | ml_kg_min | VO2max (велосипед) 🔒 | заедничко | ✅ `UserMetrics.vo2MaxCycling` | — | — | — |
| `fitness.fitness_age` | years | Фитнес возраст 🔒 | заедничко | ✅ `UserMetrics.fitnessAge` | — | — | — |
| `fitness.max_hr` | bpm | Максимален пулс (профил) 🔒 | заедничко | ❓ `FIT user_profile / zones_target.max_heart_rate` | ✅ `PhysicalInfo.maximum_heart_rate` | — | ❓ `user profile max HR` |
| `fitness.aerobic_threshold_hr` | bpm | Аеробен праг (пулс) 🔒 | заедничко | — | ✅ `PhysicalInfo.aerobic_threshold` | ✅ `FIT session.aerobic_threshold` | — |
| `fitness.anaerobic_threshold_hr` | bpm | Анаеробен / лактатен праг (пулс) 🔒 | заедничко | ❓ `FIT zones_target.threshold_heart_rate` | ✅ `PhysicalInfo.anaerobic_threshold` | ✅ `FIT session.anaerobic_threshold` | ❓ `lactate threshold HR (lthr)` |
| `fitness.threshold_pace_s_per_km` | s_per_km | Прагово темпо 🔒 | заедничко | — | — | — | ✅ `fitness overview threshold pace` |
| `fitness.race_predictions` | array | Предвидени времиња (5к/10к/полу/маратон)<br>_ActiveN исто така пресметува сопствена предикција (вендор-независна)._ 🔒 | заедничко | — | — | — | ✅ `fitness overview race predictions` |
| `fitness.ftp_w` | w | FTP 🔒 | заедничко | ❓ `FIT zones_target.functional_threshold_power` | — | — | ❓ `cycling FTP` |
| `fitness.coros_running_fitness` | score | COROS Running Fitness 🔒 | COROS (своја метрика) | — | — | — | ✅ `fitness overview running level` |
| `fitness.coros_stamina` | score | COROS Base Fitness / Stamina 🔒 | COROS (своја метрика) | — | — | — | ❓ `stamina_level` |

## Оптоварување (период)

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `load.acute` | score | Краткорочно оптоварување<br>_Различни скали; ActiveN пресметува сопствено acute/chronic од TRIMP._ 🔒 | заедничко | — | ✅ `CardioLoad.strain` | — | ✅ `training load: short-term load` |
| `load.chronic` | score | Долгорочно оптоварување 🔒 | заедничко | — | ✅ `CardioLoad.tolerance` | — | ✅ `training load: long-term load` |
| `load.ratio` | score | Однос акутно/хронично 🔒 | заедничко | — | ✅ `CardioLoad.cardio_load_ratio` | — | ✅ `training load: ratio` |
| `load.status` | enum | Статус на оптоварување 🔒 | заедничко | — | ✅ `CardioLoad.cardio_load_status` | — | ✅ `training load: daily commentary / recovery level` |

## Профил

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `profile.birth_date` | date | Датум на раѓање 🔒 | заедничко | — | ✅ `PhysicalInfo.birthday` | — | — |
| `profile.sex` | enum | Пол 🔒 | заедничко | — | ✅ `PhysicalInfo.gender` | — | — |
| `profile.training_background` | enum | Тренинг позадина 🔒 | заедничко | — | ✅ `PhysicalInfo.training_background` | — | — |
| `profile.sleep_goal_s` | s | Цел за сон 🔒 | заедничко | — | ✅ `PhysicalInfo.sleep_goal` ⟶ iso_duration_to_s | — | — |

## Планирани тренинзи (запишување кај вендор)

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `plan.workout` | array | Структуриран тренинг (испраќање на часовник)<br>_Polar AccessLink нема испраќање тренинзи — Polar корисниците го гледаат планот во ActiveN._ 🔒 | заедничко | ✅ `Training API: workoutName, sport, steps[stepOrder, intensity, durationType, durationValue, targetType, targetValueLow/High, targetZone], WorkoutRepeatStep.repeatValue` | — | ✅ `SuuntoPlus Guides API (guide.json)` | ✅ `workouts & training plans write (road/trail running, cycling)` |
| `plan.schedule` | date | Закажан датум 🔒 | заедничко | ✅ `Training API schedule: scheduledDate` | — | — | ✅ `training calendar` |

## Рути (запишување кај вендор)

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `route.course` | array | Рута (GPX/курс) 🔒 | заедничко | ✅ `Courses API` | — | ❓ `route upload` | ✅ `GPX route import/export` |

🔒 здравствен податок (согласност) · 🔒🔒 посебна категорија (не се прикажува на тренер, не се увезува без изрична потреба)
