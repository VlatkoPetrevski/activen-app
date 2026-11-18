# ADR-0007: Garmin како референтен модел (почетна фаза)

- Статус: Прифатено (одлука на корисникот, 18.11.2026)
- Датум: 2026-11-18

## Контекст

Корисникот бара во почетната фаза да се следат терминологијата и принципите на Garmin. Garmin има
најбогат и најдобро документиран модел (Health/Activity/Training API и метрики на часовникот).

## Одлука

1. **Терминологија.** Канонскиот модел ги користи Garmin имињата и единиците:
   - домени = Garmin summary типови (`activities`, `dailies`, `sleeps`, `hrv`, `stress_details`,
     `body_comps`, `user_metrics` …), клучеви `<summary type>.<Garmin поле>`;
   - полиња на активност: `activityName`, `activityType`, `calendarDate`, `startTimeInSeconds`,
     `durationInSeconds`, `distanceInMeters`, `averageHeartRateInBeatsPerMinute`, `trainingLoad` …;
   - единици по Garmin: тежина во грамови, темпо во min/km, време во Unix секунди;
   - типови активности = Garmin `activityType` (`RUNNING`, `TRAIL_RUNNING`, `TREADMILL_RUNNING` …).
     Polar, Suunto и COROS се мапираат на нив.
2. **Принципи.** Концептите и прагови се по Garmin (`garmin-metrics.ts`): Training Readiness (6
   фактори, нивоа Prime–Poor), HRV Status (7-дневен просек vs baseline), Training Effect (0–5),
   Training Status, Training Load Focus (low aerobic / high aerobic / anaerobic), acute load
   (влијанието исчезнува по 10 дена), HR зони Warm Up/Easy/Aerobic/Threshold/Maximum по % од max HR
   (дифолт max HR = 220 − возраст).
3. **Garmin вредностите имаат предност.** Кога Garmin ја дава метриката, се користи таа. За другите
   вендори ActiveN пресметува приближување по истиот принцип (алгоритмите на Firstbeat не се јавни).
4. **Своите метрики на другите вендори** (Nightly Recharge, EPOC, Running Fitness …) остануваат
   посебни полиња.
5. **Надвор од опсегот засега:** женско здравје (Garmin Women's Health, COROS циклус).

## Последици

- UI и известувањата зборуваат „Garmin јазик“, кој повеќето корисници веќе го знаат.
- Нов вендор се мапира на Garmin имиња; проширувањето надвор од Garmin полињата следи иста конвенција.
- Вредностите на `activityType` треба да се потврдат против Garmin Activity API Appendix A кога ќе
  добиеме партнерски пристап (Q17).
