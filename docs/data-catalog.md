# Каталог на податоци — Garmin, Polar, Suunto, COROS

> Статус: v1, 18.11.2026. Целосната табела поле-по-поле е во
> [data-catalog-fields.md](data-catalog-fields.md) (генерирана од кодот), а машински читливиот
> модел е во `packages/domain/src/catalog/`.

## 1. Зошто каталог

ActiveN не зависи од ниту еден вендор. Секоја метрика има **едно канонско име, единица и значење**.
Адаптерот за секој вендор ги мапира неговите полиња на тој модел. Правила:

1. **Иста намена → едно канонско поле.** Пр. `recovery.hrv_rmssd_ms` = Garmin `HRV.lastNightAvg`
   = Polar `NightlyRecharge.heart_rate_variability_avg` = COROS ноќен HRV просек.
2. **Своја метрика на вендорот → ново поле со потекло од вендорот.** Body Battery (Garmin),
   Nightly Recharge / ANS charge / Running Index (Polar), EPOC / TSS (Suunto), Running Fitness /
   Stamina (COROS). Тие **не се споредуваат** меѓу вендори, бидејќи алгоритмите се различни.
3. **Вендор-независни пресметки на ActiveN** (`origin: activen`): TRIMP, спремност (readiness),
   акутно/хронично оптоварување, предикција на резултат. Тие ја даваат споредливоста кога корисникот
   менува часовник или има повеќе извори.
4. **Единиците се фиксни:** секунди, метри, m/s, bpm, kcal, kg, °C, % — конверзиите
   (`g_to_kg`, `kmh_to_ms`, `min_per_km_to_s_per_km`, `iso_duration_to_s` …) се тестирани функции.
5. **Чувствителност:** локација и здравствени податоци се 🔒 (согласност); ЕКГ и крвен притисок се
   посебна категорија и не се увезуваат во MVP.

## 2. Што нуди секој вендор

|                               | Garmin                                                                     | Polar                                                                                                   | Suunto                                                  | COROS                                               |
| ----------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| Пристап                       | Connect Developer Program (само правни лица; **нови апликации паузирани**) | AccessLink v3, отворен за регистрирани корисници, OAuth2                                                | Партнерска програма (одобрување), OAuth2                | Partner API (одобрување) или self-service OAuth/MCP |
| Испорака                      | Push или ping→pull; Garmin ги брише суровите податоци по 7 дена            | Webhooks (EXERCISE, SLEEP, CONTINUOUS_HEART_RATE, SLEEP_WISE_*, ACTIVITY_SUMMARY, PHYSICAL_INFORMATION) | Webhook за нов тренинг; FIT фајлови                     | Webhook за тренинг (~5 мин.), 1.000 повици/мин.     |
| Историја (backfill)           | ~1 месец, по тип еднаш, макс. 24 ч по барање                               | Тренинзи само последни 30 дена                                                                          | Достапна листа на тренинзи                              | FIT; MCP: 50 фајлови/ден                            |
| Тренинзи (резиме + серии)     | ✅ богато + FIT                                                            | ✅ + samples (12 типа) + TCX                                                                            | ✅ FIT (најбогат: PTE, EPOC, recovery, VO2max, прагови) | ✅ FIT + кругови                                    |
| Дневно / стрес                | ✅                                                                         | ✅ (без стрес)                                                                                          | ❓                                                      | ✅                                                  |
| Сон                           | ✅ фази + оценка                                                           | ✅ фази + оценка + хипнограм                                                                            | ❓ (FAQ: не е достапен; други извори: достапен)         | ✅                                                  |
| HRV / ноќен опоравок          | ✅ HRV, Body Battery                                                       | ✅ Nightly Recharge, ANS                                                                                | ❓                                                      | ✅ HRV + нормален опсег, recovery %                 |
| Фитнес (VO2max, прагови)      | ✅ VO2max, фитнес возраст                                                  | ✅ VO2max, прагови, max/rest HR                                                                         | ✅ по тренинг                                           | ✅ VO2max, прагово темпо, предикции                 |
| Испраќање тренинг на часовник | ✅ Training API                                                            | ❌                                                                                                      | ✅ SuuntoPlus Guides                                    | ✅ тренинзи и планови                               |
| Рути                          | ✅ Courses API                                                             | ❌                                                                                                      | ❓                                                      | ✅ GPX                                              |

Покриеност по поле (✅ потврдено / 🟦 FIT / ❓ за потврда) е во генерираниот документ.

## 3. Последици за концептот на апликацијата

1. **Утрински брифинг** (HRV, пулс во мирување, сон) е целосно изводлив за Garmin, Polar и COROS.
   За Suunto зависи од потврда на 24/7 податоците; до тогаш брифингот се базира на оптоварување и
   субјективна оценка.
2. **Спремност (readiness)** се пресметува од ActiveN (HRV vs. личен baseline, пулс во мирување,
   сон, оптоварување) — иста логика за секој вендор. Вендорските оценки (Body Battery, Nightly
   Recharge, COROS recovery) се прикажуваат дополнително, со ознака на изворот.
3. **HR зони од вендор:** Polar ги дава границите во секој тренинг, Suunto аеробен/анаеробен праг,
   COROS прагови зони; Garmin преку FIT (за потврда). Рачниот внес останува секогаш можен.
4. **Тренерот задава тренинг → на часовник:** Garmin, Suunto, COROS. Polar корисниците го гледаат
   планот во ActiveN (и во утринскиот потсетник).
5. **Субјективна оценка:** Polar (RPE) и Suunto (feeling 1–5) веќе ја собираат; ActiveN има свој
   внес (RPE 1–10 + чувство + коментар) кој е примарен и се спојува со вендорските.
6. **Оптоварување:** секој вендор има своја скала (Garmin Training Load, Polar Cardio Load, Suunto
   TSS/EPOC, COROS Training Load). ActiveN користи **свој TRIMP** за acute/chronic и прикажува
   вендорската вредност само како информација.
7. **Историја:** Polar (30 дена) и Garmin (~1 месец) ограничуваат backfill → понудуваме увоз на
   архива (FIT/ZIP export од корисникот) при онбординг.
8. **Водење на трчање:** сите четири разликуваат патно, трејл и тредмил → канонските типови `Run`,
   `TrailRun`, `TreadmillRun`, `TrackRun`, `VirtualRun` и филтрите се поддржани за сите.

## 4. Отворено (влегува во `open-questions.md`)

- Потврда на ❓ полињата при добивање партнерски пристап (особено COROS и Suunto).
- Garmin: дали Activity summary `activeKilocalories` го вклучува BMR (изворите се разликуваат).
- FIT каденца за трчање: по нога или вкупно — по уред (тест со вистински фајлови).
- Suunto: достапност на сон/опоравок преку Cloud API.

## 5. Извори

- Garmin модели и полиња: MyDataHelps Garmin export формати (Daily, Epoch, Sleep, Stress Detail,
  HRV, Pulse Ox, Respiration, Skin Temp, Health Snapshot, Body Composition, Blood Pressure, User
  Metrics, Activity, Activity Details, Move IQ) — https://support.mydatahelps.org/garmin-export-overview
- Garmin програма, испорака и ограничувања — https://github.com/antsal06/wearable-api-field-guide/blob/main/providers/garmin.md
- Garmin Training API (структура на тренинг) — https://forums.garmin.com/developer/connect-iq/f/discussion/431359/no-interval-details-in-workouts
- Polar AccessLink v3 — https://www.polar.com/accesslink-api/
- Suunto FIT опис — https://apizone.suunto.com/fit-description ; FAQ — https://apizone.suunto.com/faq ; Workout upload — https://apizone.suunto.com/how-to-workout-upload
- COROS Partner API — https://support.coros.com/hc/en-us/articles/53181766856724-Partner-API-Access ; COROS MCP алатки — https://github.com/coroslab/coros-mcp ; преглед на податоци — https://the5krunner.com/2026/05/13/coros-mcp-ai-data/
