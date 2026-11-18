# Каталог на податоци — полиња и мапирање

> **Генериран документ** од `packages/domain/src/catalog/fields.ts` — не се уредува рачно.
> Објаснувањето и одлуките се во [data-catalog.md](data-catalog.md).

Клучевите следат Garmin терминологија: `<summary type>.<Garmin име на поле>`, со Garmin единици.

Легенда: ✅ потврдено во јавна документација · 🟦 стандардно поле во FIT профилот · ❓ намената е позната, името/единицата треба да се потврди во партнерската документација · — нема.

## Покриеност по вендор

| Вендор | ✅ | 🟦 | ❓ | Заеднички полиња без податок |
| --- | --- | --- | --- | --- |
| Garmin | 97 | 20 | 5 | 29 |
| Polar | 82 | 0 | 2 | 77 |
| Suunto | 14 | 47 | 5 | 87 |
| COROS | 24 | 47 | 25 | 58 |

Вкупно канонски полиња: **173**.

## Activities — активности (резиме)

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `activities.summaryId` | id | ID кај изворот | заедничко | ✅ `Activities.summaryId`<br>_activityId = ID во Garmin Connect_ | ✅ `Exercise.id` | ❓ `Workout.workoutKey` | ❓ `getWorkoutRecords.labelId` |
| `activities.startTimeInSeconds` | unix_s | Почеток | заедничко | ✅ `Activities.startTimeInSeconds` | ✅ `Exercise.start_time` ⟶ iso_to_epoch_s<br>_локално време + start_time_utc_offset_ | 🟦 `FIT session.start_time` | 🟦 `FIT session.start_time` |
| `activities.startTimeOffsetInSeconds` | s | Временска зона (поместување) | заедничко | ✅ `Activities.startTimeOffsetInSeconds` | ❓ `Exercise.start_time_utc_offset`<br>_веројатно во минути_ | 🟦 `FIT activity.local_timestamp − timestamp` | 🟦 `FIT activity.local_timestamp − timestamp` |
| `activities.activityName` | text | Име на активност | заедничко | ✅ `Activities.activityName` | — | 🟦 `FIT session.description (developer field)` | ❓ `getWorkoutRecords.name` |
| `activities.activityType` | enum | Спорт | заедничко | ✅ `Activities.activityType`<br>_see catalog/sports.ts_ | ✅ `Exercise.sport + detailed_sport_info` | 🟦 `FIT session.sport + sub_sport` | 🟦 `FIT session.sport + sub_sport` |
| `activities.deviceName` | text | Уред | заедничко | ✅ `Activities.deviceName` | ✅ `Exercise.device` | 🟦 `FIT file_id.product_name` | 🟦 `FIT file_id.product_name` |
| `activities.durationInSeconds` | s | Вкупно време (elapsed) | заедничко | ✅ `Activities.durationInSeconds` | ✅ `Exercise.duration` ⟶ iso_duration_to_s | 🟦 `FIT session.total_elapsed_time` | 🟦 `FIT session.total_elapsed_time` |
| `activities.timerDurationInSeconds` | s | Време без паузи | заедничко | ✅ `ActivityDetails.samples[-1].timerDurationInSeconds` | — | 🟦 `FIT session.total_timer_time` | 🟦 `FIT session.total_timer_time` |
| `activities.movingDurationInSeconds` | s | Време во движење | заедничко | ✅ `ActivityDetails.samples[-1].movingDurationInSeconds` | — | — | — |
| `activities.distanceInMeters` | m | Растојание | заедничко | ✅ `Activities.distanceInMeters` | ✅ `Exercise.distance` | 🟦 `FIT session.total_distance` | 🟦 `FIT session.total_distance` |
| `activities.averageSpeedInMetersPerSecond` | m_s | Просечна брзина | заедничко | ✅ `Activities.averageSpeedInMetersPerSecond` | — | 🟦 `FIT session.avg_speed (enhanced_avg_speed)` | 🟦 `FIT session.avg_speed (enhanced_avg_speed)` |
| `activities.maxSpeedInMetersPerSecond` | m_s | Максимална брзина | заедничко | ✅ `Activities.maxSpeedInMetersPerSecond` | — | 🟦 `FIT session.max_speed` | 🟦 `FIT session.max_speed` |
| `activities.averagePaceInMinutesPerKilometer` | min_per_km | Просечно темпо (од вендор)<br>_Garmin единица (min/km). ActiveN го пресметува темпото од elapsed time / растојание._ | заедничко | ✅ `Activities.averagePaceInMinutesPerKilometer` | — | — | — |
| `activities.totalElevationGainInMeters` | m | Искачување | заедничко | ✅ `Activities.totalElevationGainInMeters` | ❓ `Exercise TCX/samples type 3 (altitude)`<br>_нема поле во summary; се пресметува_ | 🟦 `FIT session.total_ascent` | 🟦 `FIT session.total_ascent` |
| `activities.totalElevationLossInMeters` | m | Спуштање | заедничко | ✅ `Activities.totalElevationLossInMeters` | — | 🟦 `FIT session.total_descent` | 🟦 `FIT session.total_descent` |
| `activities.averageHeartRateInBeatsPerMinute` | bpm | Просечен пулс | заедничко | ✅ `Activities.averageHeartRateInBeatsPerMinute` | ✅ `Exercise.heart_rate.average` | 🟦 `FIT session.avg_heart_rate` | 🟦 `FIT session.avg_heart_rate` |
| `activities.maxHeartRateInBeatsPerMinute` | bpm | Максимален пулс | заедничко | ✅ `Activities.maxHeartRateInBeatsPerMinute` | ✅ `Exercise.heart_rate.maximum` | 🟦 `FIT session.max_heart_rate` | 🟦 `FIT session.max_heart_rate` |
| `activities.minHeartRateInBeatsPerMinute` | bpm | Минимален пулс | заедничко | — | — | 🟦 `FIT session.min_heart_rate` | 🟦 `FIT session.min_heart_rate` |
| `activities.activeKilocalories` | kcal | Калории | заедничко | ✅ `Activities.activeKilocalories`<br>_изворите не се согласуваат дали вклучува BMR_ | ✅ `Exercise.calories` | 🟦 `FIT session.total_calories` | 🟦 `FIT session.total_calories` |
| `activities.steps` | count | Чекори | заедничко | ✅ `Activities.steps` | — | — | — |
| `activities.averageRunCadenceInStepsPerMinute` | spm | Каденца трчање (просек) | заедничко | ✅ `Activities.averageRunCadenceInStepsPerMinute` | — | 🟦 `FIT session.avg_cadence (+avg_fractional_cadence)`<br>_FIT за трчање често е по нога — проверка ×2_ | 🟦 `FIT session.avg_cadence (+avg_fractional_cadence)`<br>_FIT за трчање често е по нога — проверка ×2_ |
| `activities.maxRunCadenceInStepsPerMinute` | spm | Каденца трчање (макс.) | заедничко | ✅ `Activities.maxRunCadenceInStepsPerMinute` | — | 🟦 `FIT session.max_cadence`<br>_FIT за трчање често е по нога — проверка ×2_ | 🟦 `FIT session.max_cadence`<br>_FIT за трчање често е по нога — проверка ×2_ |
| `activities.averageBikeCadenceInRoundsPerMinute` | rpm | Каденца велосипед (просек) | заедничко | ✅ `Activities.averageBikeCadenceInRoundsPerMinute` | — | 🟦 `FIT session.avg_cadence` | 🟦 `FIT session.avg_cadence` |
| `activities.maxBikeCadenceInRoundsPerMinute` | rpm | Каденца велосипед (макс.) | заедничко | ✅ `Activities.maxBikeCadenceInRoundsPerMinute` | — | 🟦 `FIT session.max_cadence` | 🟦 `FIT session.max_cadence` |
| `activities.averagePowerInWatts` | w | Просечна моќност | заедничко | 🟦 `FIT session.avg_power` | ✅ `ExerciseSamples type 4 (power)`<br>_просек од samples_ | 🟦 `FIT session.avg_power` | 🟦 `FIT session.avg_power` |
| `activities.maxPowerInWatts` | w | Максимална моќност | заедничко | 🟦 `FIT session.max_power` | — | 🟦 `FIT session.max_power` | 🟦 `FIT session.max_power` |
| `activities.normalizedPowerInWatts` | w | Нормализирана моќност | заедничко | 🟦 `FIT session.normalized_power` | — | — | 🟦 `FIT session.normalized_power` |
| `activities.averageTemperatureInCelsius` | c | Просечна температура | заедничко | ✅ `ActivityDetails.samples.airTemperatureCelcius`<br>_просек од samples_ | — | 🟦 `FIT session.avg_temperature` | 🟦 `FIT session.avg_temperature` |
| `activities.startingLatitudeInDegree` | deg | Почетна ширина<br>_Локација — не се прикажува на тренер без согласност._ 🔒 | заедничко | ✅ `Activities.startingLatitudeInDegree` | ✅ `Exercise.route[0].latitude` | 🟦 `FIT session.start_position_lat`<br>_семикругови → степени во FIT декодерот_ | 🟦 `FIT session.start_position_lat`<br>_семикругови → степени во FIT декодерот_ |
| `activities.startingLongitudeInDegree` | deg | Почетна должина 🔒 | заедничко | ✅ `Activities.startingLongitudeInDegree` | ✅ `Exercise.route[0].longitude` | 🟦 `FIT session.start_position_long`<br>_семикругови → степени во FIT декодерот_ | 🟦 `FIT session.start_position_long`<br>_семикругови → степени во FIT декодерот_ |
| `activities.hasRoute` | bool | Има GPS рута | заедничко | — | ✅ `Exercise.has_route` | — | — |
| `activities.manual` | bool | Рачно внесена/изменета | заедничко | ✅ `Activities.manual` | — | — | — |
| `activities.parentSummaryId` | id | Мултиспорт родител | заедничко | ✅ `Activities.parentSummaryId` | — | — | — |
| `activities.poolLengthInMeters` | m | Должина на базен | заедничко | 🟦 `FIT session.pool_length` | — | 🟦 `FIT session.pool_length` | 🟦 `FIT session.pool_length` |
| `activities.numberOfActiveLengths` | count | Пливани должини | заедничко | ✅ `Activities.numberOfActiveLengths` | — | 🟦 `FIT session.num_active_lengths` | 🟦 `FIT session.num_active_lengths` |
| `activities.averageSwimCadenceInStrokesPerMinute` | spm | Каденца пливање | заедничко | ✅ `Activities.averageSwimCadenceInStrokesPerMinute` | — | 🟦 `FIT length.avg_swimming_cadence` | — |
| `activities.averageSwolf` | score | SWOLF | заедничко | — | — | ✅ `FIT session.avg_swolf` | — |
| `activities.timeInHeartRateZonesInSeconds` | array | Време по HR зони | заедничко | 🟦 `FIT session.time_in_hr_zone` | ✅ `Exercise.heart_rate_zones[].in-zone` ⟶ iso_duration_to_s | 🟦 `FIT session.time_in_hr_zone` | 🟦 `FIT session.time_in_hr_zone` |
| `activities.heartRateZoneBounds` | array | Граници на HR зони од вендорот<br>_Извор за увоз на HR зони (zonesFromLowerBounds)._ | заедничко | — | ✅ `Exercise.heart_rate_zones[].lower-limit/upper-limit` | ✅ `FIT session.aerobic_threshold / anaerobic_threshold` | — |
| `activities.perceivedEffort` | score | Субјективен напор (RPE)<br>_Канонска скала 1–10; рачно внесување во ActiveN е примарен извор._ | заедничко | — | ✅ `Exercise.training_load_pro.user-rpe` | — | ❓ `workout feedback` |
| `activities.feel` | score | Чувство (1–5)<br>_Се спојува со внесот „како се чувствуваш“ во ActiveN._ | заедничко | — | — | ✅ `FIT session.feeling`<br>_1 = најлошо, 5 = најдобро_ | — |
| `activities.aerobicTrainingEffect` | score | Аеробен ефект (0–5) | заедничко | 🟦 `FIT session.total_training_effect` | — | ✅ `FIT session.total_training_effect`<br>_Suunto: PTE_ | ❓ `FIT session.total_training_effect` |
| `activities.anaerobicTrainingEffect` | score | Анаеробен ефект (0–5) | заедничко | 🟦 `FIT session.total_anaerobic_training_effect` | — | — | ❓ `FIT session.total_anaerobic_training_effect` |
| `activities.recoveryTimeInSeconds` | s | Препорачано време за опоравок | заедничко | ❓ `FIT (Garmin developer data)` | — | ✅ `FIT session.recovery_time` | ❓ `workout summary` |
| `activities.vo2MaxEstimate` | ml_kg_min | VO2max проценка (по тренинг) | заедничко | — | — | ✅ `FIT session.estimated_vo2_max` | — |
| `activities.averageGroundContactTimeInMilliseconds` | ms | Контакт со подлога | заедничко | 🟦 `FIT session.avg_stance_time` | — | — | ❓ `FIT session.avg_stance_time` |
| `activities.averageVerticalOscillationInMillimeters` | mm | Вертикална осцилација | заедничко | 🟦 `FIT session.avg_vertical_oscillation` | — | — | ❓ `FIT session.avg_vertical_oscillation` |
| `activities.averageStrideLengthInMillimeters` | mm | Должина на чекор | заедничко | 🟦 `FIT session.avg_step_length` | — | — | ❓ `FIT session.avg_step_length` |
| `activities.polarRunningIndex` | score | Polar Running Index | Polar (своја метрика) | — | ✅ `Exercise.running-index` | — | — |
| `activities.polarEnergySourcesInPercent` | array | Извори на енергија (масти/јаглехидрати/протеини) | Polar (своја метрика) | — | ✅ `Exercise.fat_percentage / carbohydrate_percentage / protein_percentage` | — | — |
| `activities.polarCardioLoad` | score | Polar Cardio Load | Polar (своја метрика) | — | ✅ `Exercise.training_load_pro.cardio-load` | — | — |
| `activities.polarMuscleLoad` | score | Polar Muscle Load | Polar (своја метрика) | — | ✅ `Exercise.training_load_pro.muscle-load` | — | — |
| `activities.polarPerceivedLoad` | score | Polar Perceived Load | Polar (своја метрика) | — | ✅ `Exercise.training_load_pro.perceived-load` | — | — |
| `activities.trainingLoad` | score | Training Load (оптоварување на активноста)<br>_Garmin концепт (EPOC). Polar/Suunto/COROS имаат свои скали во посебни полиња; без Garmin се користи TRIMP._ | заедничко | ❓ `FIT session.training_load_peak` | — | — | — |
| `activities.suuntoTss` | score | Suunto TSS | Suunto (своја метрика) | — | — | ✅ `Workout.tss / tssList` | — |
| `activities.suuntoPeakEpoc` | score | Suunto EPOC | Suunto (своја метрика) | — | — | ✅ `FIT session.peak_epoc` | — |
| `activities.corosTrainingLoad` | score | COROS Training Load | COROS (своја метрика) | — | — | — | ❓ `workout summary trainingLoad` |
| `activities.trimp` | score | TRIMP (ActiveN)<br>_Независен од вендор, пресметан од пулс и време; основа за споредба и оптоварување._ | ActiveN | — | — | — | — |

## Activity laps — кругови

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `activity_laps.startTimeInSeconds` | unix_s | Почеток на круг | заедничко | ✅ `ActivityDetails.laps[].startTimeInSeconds` | — | 🟦 `FIT lap.start_time` | 🟦 `FIT lap.start_time` |
| `activity_laps.durationInSeconds` | s | Време на круг | заедничко | 🟦 `FIT lap.total_elapsed_time` | — | 🟦 `FIT lap.total_elapsed_time` | 🟦 `FIT lap.total_elapsed_time` |
| `activity_laps.distanceInMeters` | m | Растојание на круг | заедничко | 🟦 `FIT lap.total_distance` | — | 🟦 `FIT lap.total_distance` | 🟦 `FIT lap.total_distance` |
| `activity_laps.averageHeartRateInBeatsPerMinute` | bpm | Просечен пулс (круг) | заедничко | 🟦 `FIT lap.avg_heart_rate` | — | 🟦 `FIT lap.avg_heart_rate` | 🟦 `FIT lap.avg_heart_rate` |
| `activity_laps.maxHeartRateInBeatsPerMinute` | bpm | Макс. пулс (круг) | заедничко | 🟦 `FIT lap.max_heart_rate` | — | 🟦 `FIT lap.max_heart_rate` | 🟦 `FIT lap.max_heart_rate` |
| `activity_laps.averageSpeedInMetersPerSecond` | m_s | Брзина (круг) | заедничко | 🟦 `FIT lap.avg_speed` | — | 🟦 `FIT lap.avg_speed` | 🟦 `FIT lap.avg_speed` |
| `activity_laps.averagePowerInWatts` | w | Моќност (круг) | заедничко | 🟦 `FIT lap.avg_power` | — | 🟦 `FIT lap.avg_power` | 🟦 `FIT lap.avg_power` |
| `activity_laps.averageCadence` | spm | Каденца (круг) | заедничко | 🟦 `FIT lap.avg_cadence` | — | 🟦 `FIT lap.avg_cadence` | 🟦 `FIT lap.avg_cadence` |
| `activity_laps.totalElevationGainInMeters` | m | Искачување (круг) | заедничко | 🟦 `FIT lap.total_ascent` | — | 🟦 `FIT lap.total_ascent` | 🟦 `FIT lap.total_ascent` |
| `activity_laps.lapTrigger` | enum | Причина за круг | заедничко | 🟦 `FIT lap.lap_trigger` | — | 🟦 `FIT lap.lap_trigger` | 🟦 `FIT lap.lap_trigger` |

## Activity samples — временски серии

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `activity_samples.startTimeInSeconds` | series | Време | заедничко | ✅ `ActivityDetails.samples.startTimeInSeconds` | ✅ `ExerciseSamples.recording-rate`<br>_временска оска од recording-rate_ | 🟦 `FIT record.timestamp` | 🟦 `FIT record.timestamp` |
| `activity_samples.position` | series | GPS позиција 🔒 | заедничко | ✅ `ActivityDetails.samples.latitudeInDegree/longitudeInDegree` | ✅ `Exercise.route[].latitude/longitude` | 🟦 `FIT record.position_lat/position_long` | 🟦 `FIT record.position_lat/position_long` |
| `activity_samples.elevationInMeters` | series | Надморска висина | заедничко | ✅ `ActivityDetails.samples.elevationInMeters` | ✅ `ExerciseSamples type 3` | 🟦 `FIT record.altitude` | 🟦 `FIT record.altitude` |
| `activity_samples.heartRate` | series | Пулс | заедничко | ✅ `ActivityDetails.samples.heartrate` | ✅ `ExerciseSamples type 0` | 🟦 `FIT record.heart_rate` | 🟦 `FIT record.heart_rate` |
| `activity_samples.speedMetersPerSecond` | series | Брзина | заедничко | ✅ `ActivityDetails.samples.speedMetersPerSecond` | ✅ `ExerciseSamples type 1` ⟶ kmh_to_ms | 🟦 `FIT record.speed` | 🟦 `FIT record.speed` |
| `activity_samples.totalDistanceInMeters` | series | Растојание | заедничко | ✅ `ActivityDetails.samples.totalDistanceInMeters` | ✅ `ExerciseSamples type 10` | 🟦 `FIT record.distance` | 🟦 `FIT record.distance` |
| `activity_samples.cadence` | series | Каденца | заедничко | ✅ `ActivityDetails.samples.stepsPerMinute / bikeCadenceInRPM` | ✅ `ExerciseSamples type 2 (rpm) / 8 (spm)` | 🟦 `FIT record.cadence` | 🟦 `FIT record.cadence` |
| `activity_samples.powerInWatts` | series | Моќност | заедничко | ✅ `ActivityDetails.samples.powerInWatts` | ✅ `ExerciseSamples type 4` | 🟦 `FIT record.power` | 🟦 `FIT record.power` |
| `activity_samples.airTemperatureInCelsius` | series | Температура | заедничко | ✅ `ActivityDetails.samples.airTemperatureCelcius` | ✅ `ExerciseSamples type 9` | — | 🟦 `FIT record.temperature` |
| `activity_samples.rrIntervalInMilliseconds` | series | RR интервали | заедничко | 🟦 `FIT hrv.time` | ✅ `ExerciseSamples type 11`<br>_само со H6/H7/H9/H10 сензор_ | ✅ `FIT hrv.time`<br>_во секунди во FIT_ | — |
| `activity_samples.suuntoEpoc` | series | EPOC (тек) | Suunto (своја метрика) | — | — | ✅ `FIT record.epoc` | — |

## Dailies — дневно резиме

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `dailies.steps` | count | Чекори 🔒 | заедничко | ✅ `Dailies.steps` | ✅ `DailyActivity.steps` | ❓ `247 activity steps` | ❓ `getDailyData.steps` |
| `dailies.distanceInMeters` | m | Дневно растојание 🔒 | заедничко | ✅ `Dailies.distanceInMeters` | ✅ `DailyActivity.distance_from_steps` | — | — |
| `dailies.activeKilocalories` | kcal | Активни калории 🔒 | заедничко | ✅ `Dailies.activeKilocalories` | ✅ `DailyActivity.active_calories` | — | ❓ `getDailyData.calories` |
| `dailies.bmrKilocalories` | kcal | Базални калории (BMR) 🔒 | заедничко | ✅ `Dailies.bmrKilocalories` | — | — | — |
| `dailies.totalKilocalories` | kcal | Вкупно калории<br>_Garmin: active + BMR._ 🔒 | заедничко | — | ✅ `DailyActivity.calories` | — | — |
| `dailies.activeTimeInSeconds` | s | Активно време 🔒 | заедничко | ✅ `Dailies.activeTimeInSeconds` | ✅ `DailyActivity.active_duration` ⟶ iso_duration_to_s | — | — |
| `dailies.inactiveTimeInSeconds` | s | Неактивно време 🔒 | заедничко | — | ✅ `DailyActivity.inactive_duration` ⟶ iso_duration_to_s | — | — |
| `dailies.moderateIntensityDurationInSeconds` | s | Умерен интензитет 🔒 | заедничко | ✅ `Dailies.moderateIntensityDurationInSeconds` | — | — | — |
| `dailies.vigorousIntensityDurationInSeconds` | s | Висок интензитет 🔒 | заедничко | ✅ `Dailies.vigorousIntensityDurationInSeconds` | — | — | — |
| `dailies.floorsClimbed` | count | Искачени катови 🔒 | заедничко | ✅ `Dailies.floorsClimbed` | — | — | — |
| `dailies.restingHeartRateInBeatsPerMinute` | bpm | Пулс во мирување 🔒 | заедничко | ✅ `Dailies.restingHeartRateInBeatsPerMinute` | ✅ `PhysicalInfo.resting_heart_rate`<br>_профилна вредност, не дневна_ | — | ✅ `queryRestingHeartRate` |
| `dailies.minHeartRateInBeatsPerMinute` | bpm | Мин. пулс (ден) 🔒 | заедничко | ✅ `Dailies.minHeartRateInBeatsPerMinute` | — | — | — |
| `dailies.maxHeartRateInBeatsPerMinute` | bpm | Макс. пулс (ден) 🔒 | заедничко | ✅ `Dailies.maxHeartRateInBeatsPerMinute` | — | — | — |
| `dailies.averageHeartRateInBeatsPerMinute` | bpm | Просечен пулс (ден) 🔒 | заедничко | ✅ `Dailies.averageHeartRateInBeatsPerMinute`<br>_Garmin: просек на последните 7 дена_ | — | — | ✅ `queryAvgHeartRate` |
| `dailies.averageStressLevel` | score | Просечен стрес 🔒 | заедничко | ✅ `Dailies.averageStressLevel`<br>_1–100; −1 = недоволно податоци_ | — | — | ✅ `queryStressLevel` |
| `dailies.maxStressLevel` | score | Макс. стрес 🔒 | заедничко | ✅ `Dailies.maxStressLevel` | — | — | — |
| `dailies.stressDurationsInSeconds` | array | Време по стрес нивоа 🔒 | заедничко | ✅ `Dailies.rest/low/medium/highStressDurationInSeconds` | — | — | — |
| `dailies.stepsGoal` | count | Цел за чекори 🔒 | заедничко | ✅ `Dailies.stepsGoal` | — | — | — |
| `dailies.timeOffsetHeartRateSamples` | series | Пулс низ денот 🔒 | заедничко | ✅ `Dailies.timeOffsetHeartRateSamples` | ✅ `ContinuousHeartRate.heart_rate_samples`<br>_5-минутни вредности_ | — | ❓ `heart rate time series` |

## Epochs — 15-минутни интервали

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `epochs.epochSummaries` | series | Активност по интервали 🔒 | заедничко | ✅ `Epochs (15 min): activityType, met, intensity, steps` | ✅ `DailyActivity.samples.activity_zones` | — | — |

## Sleeps — сон

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sleeps.startTimeInSeconds` | unix_s | Почеток на сон 🔒 | заедничко | ✅ `Sleeps.startTimeInSeconds` | ✅ `Sleep.sleep_start_time` ⟶ iso_to_epoch_s | ❓ `247 sleep`<br>_Suunto FAQ: сонот можеби не е достапен преку Cloud API_ | ❓ `sleep start` |
| `sleeps.endTimeInSeconds` | unix_s | Крај на сон<br>_Garmin: start + duration + awake._ 🔒 | заедничко | — | ✅ `Sleep.sleep_end_time` ⟶ iso_to_epoch_s | — | ❓ `sleep end` |
| `sleeps.durationInSeconds` | s | Времетраење на сон 🔒 | заедничко | ✅ `Sleeps.durationInSeconds` | ✅ `Sleep light+deep+rem` | — | ❓ `sleep total` |
| `sleeps.deepSleepDurationInSeconds` | s | Длабок сон 🔒 | заедничко | ✅ `Sleeps.deepSleepDurationInSeconds` | ✅ `Sleep.deep_sleep` | — | ❓ `sleep deep` |
| `sleeps.lightSleepDurationInSeconds` | s | Лесен сон 🔒 | заедничко | ✅ `Sleeps.lightSleepDurationInSeconds` | ✅ `Sleep.light_sleep` | — | ❓ `sleep light` |
| `sleeps.remSleepInSeconds` | s | REM сон 🔒 | заедничко | ✅ `Sleeps.remSleepInSeconds` | ✅ `Sleep.rem_sleep` | — | ❓ `sleep rem` |
| `sleeps.awakeDurationInSeconds` | s | Будност / прекини 🔒 | заедничко | ✅ `Sleeps.awakeDurationInSeconds` | ✅ `Sleep.total_interruption_duration` | — | ❓ `sleep awake` |
| `sleeps.unmeasurableSleepInSeconds` | s | Неизмерен сон 🔒 | заедничко | ✅ `Sleeps.unmeasurableSleepInSeconds` | ✅ `Sleep.unrecognized_sleep_stage` | — | — |
| `sleeps.overallSleepScore` | score | Оценка на сон (0–100)<br>_Различни алгоритми; се прикажува со извор, не се усреднува меѓу вендори._ 🔒 | заедничко | ✅ `Sleeps.overallSleepScore.value` | ✅ `Sleep.sleep_score` | — | ❓ `sleep score` |
| `sleeps.sleepLevelsMap` | series | Фази на сон (хипнограм) 🔒 | заедничко | ✅ `Sleeps.sleepLevelsMap (deep/light/rem/awake)` | ✅ `Sleep.hypnogram`<br>_0 будност, 1 REM, 2–3 лесен, 4 длабок, 5 непознато_ | — | — |
| `sleeps.sleepHeartRateSamples` | series | Пулс во сон 🔒 | заедничко | — | ✅ `Sleep.heart_rate_samples` | — | — |
| `sleeps.timeOffsetSleepRespiration` | series | Дишење во сон 🔒 | заедничко | ✅ `Sleeps.timeOffsetSleepRespiration` | — | — | — |
| `sleeps.timeOffsetSleepSpo2` | series | SpO2 во сон 🔒 | заедничко | ✅ `Sleeps.timeOffsetSleepSpo2` | — | — | — |
| `sleeps.naps` | array | Дремки 🔒 | заедничко | ✅ `Sleeps.naps` | — | — | — |
| `sleeps.sleepCycles` | count | Циклуси на сон 🔒 | заедничко | — | ✅ `Sleep.sleep_cycles` | — | — |
| `sleeps.polarContinuity` | score | Континуитет 🔒 | Polar (своја метрика) | — | ✅ `Sleep.continuity / continuity_class` | — | — |
| `sleeps.sleepRating` | score | Лична оценка на сон 🔒 | заедничко | — | ✅ `Sleep.sleep_rating`<br>_0–5; 0 = не е внесено_ | — | — |
| `sleeps.polarSleepCharge` | score | Polar Sleep Charge 🔒 | Polar (своја метрика) | — | ✅ `Sleep.sleep_charge`<br>_1–5 споредено со 28 дена_ | — | — |
| `sleeps.averageSleepHeartRate` | bpm | Ноќен пулс (просек) 🔒 | заедничко | — | ✅ `NightlyRecharge.heart_rate_avg` | — | — |
| `sleeps.averageRespirationValue` | brpm | Ноќно дишење (просек) 🔒 | заедничко | ✅ `Sleeps.timeOffsetSleepRespiration`<br>_просек од samples_ | ✅ `NightlyRecharge.breathing_rate_avg` | — | — |
| `sleeps.polarAlertness` | series | Polar SleepWise будност 🔒 | Polar (своја метрика) | — | ✅ `SleepWise.alertness (grade, hourly_data)` | — | — |
| `sleeps.polarCircadianBedtime` | array | Polar циркадијално време за сон 🔒 | Polar (своја метрика) | — | ✅ `SleepWise.circadian-bedtime (sleep_gate_start/end_time)` | — | — |

## HRV — варијабилност на пулс (ноќ)

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hrv.lastNightAvg` | ms | HRV ноќен просек (RMSSD) 🔒 | заедничко | ✅ `HRV.lastNightAvg` | ✅ `NightlyRecharge.heart_rate_variability_avg` | ❓ `247 recovery HRV` | ✅ `querySleepHrv (daily average)` |
| `hrv.hrvValues` | series | HRV низ ноќта 🔒 | заедничко | ✅ `HRV.hrvValues` | ✅ `NightlyRecharge.hrv_samples` | — | ✅ `querySleepHrv (raw curve)` |
| `hrv.lastNight5MinHigh` | ms | HRV највисок 5-мин. 🔒 | заедничко | ✅ `HRV.lastNight5MinHigh` | — | — | — |
| `hrv.baselineRange` | array | HRV нормален опсег<br>_За другите вендори ActiveN го пресметува од 7/28-дневна историја._ 🔒 | заедничко | — | — | — | ✅ `querySleepHrv (normal range)` |
| `hrv.polarNightlyRechargeStatus` | score | Polar Nightly Recharge (1–6) 🔒 | Polar (своја метрика) | — | ✅ `NightlyRecharge.nightly_recharge_status` | — | — |
| `hrv.polarAnsCharge` | score | Polar ANS charge (−10…+10) 🔒 | Polar (своја метрика) | — | ✅ `NightlyRecharge.ans_charge / ans_charge_status` | — | — |

## Stress details — стрес и Body Battery

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `stress_details.timeOffsetBodyBatteryValues` | series | Garmin Body Battery 🔒 | Garmin (своја метрика) | ✅ `StressDetails.timeOffsetBodyBatteryValues (+ activity events)` | — | — | — |
| `stress_details.timeOffsetStressLevelValues` | series | Стрес низ денот 🔒 | заедничко | ✅ `StressDetails.timeOffsetStressLevelValues`<br>_3-мин. просеци 1–100_ | — | — | ✅ `queryStressTimeSeries` |

## Respiration — дишење

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `respiration.timeOffsetEpochToBreaths` | series | Дишење низ денот 🔒 | заедничко | ✅ `Respiration.timeOffsetEpochToBreaths` | — | — | — |

## Pulse Ox — SpO2

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pulse_ox.timeOffsetSpo2Values` | series | SpO2 низ денот 🔒 | заедничко | ✅ `PulseOx.timeOffsetSpo2Values` | — | — | — |
| `pulse_ox.onDemandSpo2` | pct | Мерење: SpO2 🔒 | заедничко | ✅ `PulseOx.timeOffsetSpo2Values (onDemand = true)` | ✅ `Biosensing.spo2.blood_oxygen_percent` | — | ✅ `queryHealthCheckTimeSeries (SpO2)` |

## Skin temperature — температура на кожа

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `skin_temp.avgDeviationCelsius` | c | Отстапување на температура на кожа 🔒 | заедничко | ✅ `SkinTemp.avgDeviationCelsius` | ✅ `Biosensing.skintemperature.deviation_from_baseline_celsius` | — | — |

## Health Snapshot — моментални мерења

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `health_snapshot.heartRateAvgValue` | bpm | Мерење: пулс 🔒 | заедничко | ✅ `HealthSnapshot.heartRateAvgValue` | — | — | ✅ `queryHealthCheckTimeSeries (heart rate)` |
| `health_snapshot.rmssdAvgValue` | ms | Мерење: HRV (RMSSD) 🔒 | заедничко | ✅ `HealthSnapshot.rmssdAvgValue` | ✅ `Biosensing.ecg.heart_rate_variability_ms` | — | ✅ `queryHealthCheckTimeSeries (HRV)` |
| `health_snapshot.respirationAvgValue` | brpm | Мерење: дишење 🔒 | заедничко | ✅ `HealthSnapshot.respirationAvgValue` | — | — | ✅ `queryHealthCheckTimeSeries (respiratory rate)` |
| `health_snapshot.stressAvgValue` | score | Мерење: стрес 🔒 | заедничко | ✅ `HealthSnapshot.stressAvgValue` | — | — | ✅ `queryHealthCheckTimeSeries (stress)` |
| `health_snapshot.bodyTemperatureInCelsius` | c | Телесна температура 🔒 | заедничко | — | ✅ `Biosensing.bodytemperature.samples.temperature_celsius` | — | — |
| `health_snapshot.ecg` | series | ЕКГ<br>_Медицински податок — надвор од опсегот; не се увезува._ 🔒🔒 | заедничко | — | ✅ `Biosensing.ecg` | — | — |

## Body composition — состав на тело

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `body_comps.weightInGrams` | g | Тежина 🔒 | заедничко | ✅ `BodyComps.weightInGrams` | ✅ `PhysicalInfo.weight` ⟶ kg_to_g | — | — |
| `body_comps.bodyMassIndex` | score | BMI 🔒 | заедничко | ✅ `BodyComps.bodyMassIndex` | — | — | — |
| `body_comps.bodyFatInPercent` | pct | Масно ткиво 🔒 | заедничко | ✅ `BodyComps.bodyFatInPercent` | — | — | — |
| `body_comps.bodyWaterInPercent` | pct | Вода во телото 🔒 | заедничко | ✅ `BodyComps.bodyWaterInPercent` | — | — | — |
| `body_comps.muscleMassInGrams` | g | Мускулна маса 🔒 | заедничко | ✅ `BodyComps.muscleMassInGrams` | — | — | — |
| `body_comps.boneMassInGrams` | g | Коскена маса 🔒 | заедничко | ✅ `BodyComps.boneMassInGrams` | — | — | — |

## Blood pressure — крвен притисок

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `blood_pressure.reading` | mmhg | Крвен притисок 🔒🔒 | заедничко | ✅ `BloodPressure.systolic/diastolic/pulse` | — | — | — |

## User metrics — фитнес метрики

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `user_metrics.vo2Max` | ml_kg_min | VO2max (трчање) 🔒 | заедничко | ✅ `UserMetrics.vo2Max` | ✅ `PhysicalInfo.vo2_max` | ✅ `FIT session.estimated_vo2_max`<br>_по тренинг_ | ✅ `fitness overview VO2max` |
| `user_metrics.vo2MaxCycling` | ml_kg_min | VO2max (велосипед) 🔒 | заедничко | ✅ `UserMetrics.vo2MaxCycling` | — | — | — |
| `user_metrics.fitnessAge` | years | Фитнес возраст 🔒 | заедничко | ✅ `UserMetrics.fitnessAge` | — | — | — |
| `user_metrics.maxHeartRateInBeatsPerMinute` | bpm | Максимален пулс (профил) 🔒 | заедничко | ❓ `FIT user_profile / zones_target.max_heart_rate` | ✅ `PhysicalInfo.maximum_heart_rate` | — | ❓ `user profile max HR` |
| `user_metrics.aerobicThresholdHeartRate` | bpm | Аеробен праг (пулс) 🔒 | заедничко | — | ✅ `PhysicalInfo.aerobic_threshold` | ✅ `FIT session.aerobic_threshold` | — |
| `user_metrics.lactateThresholdHeartRate` | bpm | Анаеробен / лактатен праг (пулс) 🔒 | заедничко | ❓ `FIT zones_target.threshold_heart_rate` | ✅ `PhysicalInfo.anaerobic_threshold` | ✅ `FIT session.anaerobic_threshold` | ❓ `lactate threshold HR (lthr)` |
| `user_metrics.lactateThresholdPaceInSecondsPerKilometer` | s_per_km | Прагово темпо 🔒 | заедничко | — | — | — | ✅ `fitness overview threshold pace` |
| `user_metrics.racePredictorTimes` | array | Предвидени времиња (5к/10к/полу/маратон)<br>_ActiveN исто така пресметува сопствена предикција (вендор-независна)._ 🔒 | заедничко | — | — | — | ✅ `fitness overview race predictions` |
| `user_metrics.functionalThresholdPowerInWatts` | w | FTP 🔒 | заедничко | ❓ `FIT zones_target.functional_threshold_power` | — | — | ❓ `cycling FTP` |
| `user_metrics.corosRunningFitness` | score | COROS Running Fitness 🔒 | COROS (своја метрика) | — | — | — | ✅ `fitness overview running level` |
| `user_metrics.corosStamina` | score | COROS Base Fitness / Stamina 🔒 | COROS (своја метрика) | — | — | — | ❓ `stamina_level` |

## Training status — спремност, оптоварување, статус

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `training_status.corosRecoveryPercent` | pct | COROS опоравок (%) 🔒 | COROS (своја метрика) | — | — | — | ✅ `recovery status (percentage, level, time to full recovery)` |
| `training_status.trainingReadiness` | score | Training Readiness (спремност)<br>_По Garmin принцип: sleep score, recovery time, HRV status, acute load, историја на сон и стрес. 1–100: Prime/High/Moderate/Low/Poor._ 🔒 | ActiveN | — | — | — | — |
| `training_status.hrvStatus` | enum | HRV Status<br>_По Garmin принцип: 7-дневен просек vs личен baseline (Balanced/Unbalanced/Low/Poor/No status)._ 🔒 | ActiveN | — | — | — | — |
| `training_status.loadFocus` | array | Training Load Focus<br>_По Garmin принцип: 4-неделна распределба Low aerobic / High aerobic / Anaerobic._ 🔒 | ActiveN | — | — | — | — |
| `training_status.acuteLoad` | score | Acute Load (краткорочно оптоварување)<br>_Различни скали; ActiveN пресметува сопствено acute/chronic од TRIMP._ 🔒 | заедничко | — | ✅ `CardioLoad.strain` | — | ✅ `training load: short-term load` |
| `training_status.chronicLoad` | score | Долгорочно оптоварување 🔒 | заедничко | — | ✅ `CardioLoad.tolerance` | — | ✅ `training load: long-term load` |
| `training_status.loadRatio` | score | Однос акутно/хронично 🔒 | заедничко | — | ✅ `CardioLoad.cardio_load_ratio` | — | ✅ `training load: ratio` |
| `training_status.trainingStatus` | enum | Training Status 🔒 | заедничко | — | ✅ `CardioLoad.cardio_load_status` | — | ✅ `training load: daily commentary / recovery level` |

## Profile — профил

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `profile.heightInCentimeters` | cm | Висина 🔒 | заедничко | — | ✅ `PhysicalInfo.height` | — | — |
| `profile.birthDate` | date | Датум на раѓање 🔒 | заедничко | — | ✅ `PhysicalInfo.birthday` | — | — |
| `profile.gender` | enum | Пол 🔒 | заедничко | — | ✅ `PhysicalInfo.gender` | — | — |
| `profile.trainingBackground` | enum | Тренинг позадина 🔒 | заедничко | — | ✅ `PhysicalInfo.training_background` | — | — |
| `profile.sleepGoalInSeconds` | s | Цел за сон 🔒 | заедничко | — | ✅ `PhysicalInfo.sleep_goal` ⟶ iso_duration_to_s | — | — |

## Workouts (Training API) — планирани тренинзи кон часовник

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `workouts.workout` | array | Структуриран тренинг (испраќање на часовник)<br>_Polar AccessLink нема испраќање тренинзи — Polar корисниците го гледаат планот во ActiveN._ 🔒 | заедничко | ✅ `Training API: workoutName, sport, steps[stepOrder, intensity, durationType, durationValue, targetType, targetValueLow/High, targetZone], WorkoutRepeatStep.repeatValue` | — | ✅ `SuuntoPlus Guides API (guide.json)` | ✅ `workouts & training plans write (road/trail running, cycling)` |
| `workouts.scheduledDate` | date | Закажан датум 🔒 | заедничко | ✅ `Training API schedule: scheduledDate` | — | — | ✅ `training calendar` |

## Courses (Courses API) — рути

| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `courses.course` | array | Рута (GPX/курс) 🔒 | заедничко | ✅ `Courses API` | — | ❓ `route upload` | ✅ `GPX route import/export` |

🔒 здравствен податок (согласност) · 🔒🔒 посебна категорија (не се прикажува на тренер, не се увезува без изрична потреба)
