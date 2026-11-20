import {
  ACTIVITY_TYPES,
  HRV_BASELINE_MIN_NIGHTS,
  LOAD_FOCUS_CATEGORIES,
  LOAD_FOCUS_FEEDBACK,
  TRAINING_STATUSES,
  garminHeartRateZones,
} from "@activen/domain";
import { describe, expect, it, vi } from "vitest";
import {
  CATALOGS,
  completeLocales,
  createFormatter,
  createTranslator,
  DEFAULT_LOCALE,
  en,
  garminTerm,
  hrZoneName,
  isLocale,
  labels,
  matchLocale,
  messageArguments,
  mk,
  negotiateLocale,
  parseAcceptLanguage,
  pseudoCatalog,
  pseudoLocalize,
  SUPPORTED_LOCALES,
  validateCatalogs,
} from "../src/index.js";

describe("locales and negotiation", () => {
  it("supports Macedonian and English, Macedonian by default", () => {
    expect(SUPPORTED_LOCALES).toEqual(["mk", "en"]);
    expect(DEFAULT_LOCALE).toBe("mk");
    expect(isLocale("mk")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(matchLocale("en-GB")).toBe("en");
    expect(matchLocale("MK_mk")).toBe("mk");
    expect(matchLocale("sq-MK")).toBeNull();
  });

  it("parses Accept-Language by quality", () => {
    expect(parseAcceptLanguage("de;q=0.5, en-US,en;q=0.9, *;q=0.1, sq;q=0")).toEqual([
      "en-US",
      "en",
      "de",
    ]);
    expect(parseAcceptLanguage("fr;q=abc")).toEqual([]);
  });

  it("prefers the profile setting, then the device, then the default", () => {
    expect(negotiateLocale({ userPreference: "en", acceptLanguage: "mk" })).toBe("en");
    expect(negotiateLocale({ userPreference: "de", acceptLanguage: "de, en;q=0.8" })).toBe("en");
    expect(negotiateLocale({ acceptLanguage: ["sq-MK", "mk-MK"] })).toBe("mk");
    expect(negotiateLocale({ acceptLanguage: "fr" })).toBe("mk");
    expect(negotiateLocale({})).toBe("mk");
  });
});

describe("catalogs", () => {
  it("are complete and consistent (keys, ICU syntax, placeholders)", () => {
    expect(validateCatalogs()).toEqual([]);
    expect(completeLocales()).toEqual(["mk", "en"]);
    expect(Object.keys(mk).sort()).toEqual(Object.keys(en).sort());
  });

  it("cover every domain code", () => {
    for (const v of ACTIVITY_TYPES) expect(en[`activityType.${v}`]).toBeTruthy();
    for (const v of TRAINING_STATUSES) expect(mk[`trainingStatus.${v}`]).toBeTruthy();
    for (const v of LOAD_FOCUS_CATEGORIES) expect(mk[`loadFocus.category.${v}`]).toBeTruthy();
    for (const v of LOAD_FOCUS_FEEDBACK) expect(mk[`loadFocus.feedback.${v}`]).toBeTruthy();
    expect(HRV_BASELINE_MIN_NIGHTS).toBe(21);
  });

  it("reports missing, extra, empty, syntax and placeholder problems", () => {
    const issues = validateCatalogs({
      en: { a: "Hi {name}", b: "x", c: "{n, plural, one {#} other {#}}", d: "ok", e: "{broken" },
      xx: { a: "Здраво {ime}", c: "{n, plural, one {#} other {#}", d: " ", e: "e", z: "extra" },
    }).map((i) => `${i.locale}:${i.key}:${i.problem}`);
    expect(issues).toEqual(
      expect.arrayContaining([
        "en:e:SYNTAX",
        "xx:a:PLACEHOLDERS",
        "xx:b:MISSING",
        "xx:c:SYNTAX",
        "xx:d:EMPTY",
        "xx:z:EXTRA",
      ]),
    );
  });

  it("extracts arguments from nested ICU messages", () => {
    expect(
      [
        ...messageArguments("{a} {n, plural, one {{b}} other {<t>{c, number}</t>}} {d, date}"),
      ].sort(),
    ).toEqual(["a", "b", "c", "d", "n"]);
  });
});

describe("translator", () => {
  const mkT = createTranslator("mk");
  const enT = createTranslator("en");

  it("formats messages with placeholders, plurals and selects", () => {
    expect(mkT.t("today.greeting.morning", { name: "Влатко" })).toBe("Добро утро, Влатко");
    expect(enT.t("coach.athletes.count", { count: 1 })).toBe("1 athlete");
    expect(enT.t("coach.athletes.count", { count: 12 })).toBe("12 athletes");
    // Macedonian plural: 1 and 21 are "one", 11 is "other".
    expect(mkT.t("coach.athletes.count", { count: 1 })).toBe("1 спортист");
    expect(mkT.t("coach.athletes.count", { count: 21 })).toBe("21 спортист");
    expect(mkT.t("coach.athletes.count", { count: 11 })).toBe("11 спортисти");
    expect(mkT.t("coach.workoutsToday", { count: 0 })).toBe("Денес нема тренинзи");
    expect(mkT.t("checkin.rpe.value", { value: "8" })).toBe("Многу напорно");
    expect(enT.t("checkin.rpe.value", { value: "10" })).toBe("Maximal");
  });

  it("falls back to English and reports missing keys once", () => {
    const onMissing = vi.fn();
    const t = createTranslator("mk", { onMissing, catalogs: { mk: { "nav.today": "Денес" } } });
    expect(t.t("nav.plan")).toBe("Plan");
    expect(t.t("nav.plan")).toBe("Plan");
    expect(onMissing).toHaveBeenCalledTimes(1);
    expect(onMissing).toHaveBeenCalledWith("nav.plan", "mk");
    expect(t.has("nav.today")).toBe(true);
    expect(t.has("nav.plan")).toBe(false);
    const none = createTranslator("mk", { catalogs: { mk: {}, en: {} } });
    expect(none.t("nav.plan")).toBe("nav.plan");
  });
});

describe("labels", () => {
  const mkT = createTranslator("mk");
  const enT = createTranslator("en");

  it("translates domain codes", () => {
    expect(labels.activityType(mkT, "TREADMILL_RUNNING")).toBe("Тредмил");
    expect(labels.activityType(enT, "TRAIL_RUNNING")).toBe("Trail Run");
    expect(labels.activityGroup(mkT, "running")).toBe("Трчање");
    expect(labels.trainingReadiness(mkT, "MODERATE")).toBe("Умерена");
    expect(labels.trainingReadinessMessage(enT, "LOW")).toBe("Time to slow down.");
    expect(labels.hrvStatus(mkT, "BALANCED")).toBe("Избалансиран");
    expect(labels.trainingEffect(mkT, "IMPACTING")).toBe("Подобрува");
    expect(labels.trainingStatus(enT, "PRODUCTIVE")).toBe("Productive");
    expect(labels.loadFocusCategory(mkT, "ANAEROBIC")).toBe("Анаеробно");
    expect(labels.loadFocusFeedback(enT, "ABOVE_TARGETS")).toBe("Above targets");
  });

  it("translates Garmin default zone names but keeps custom ones", () => {
    const zones = garminHeartRateZones(190);
    expect(zones.map((z) => hrZoneName(mkT, z))).toEqual([
      "Загревање",
      "Лесно",
      "Аеробно",
      "Праг",
      "Максимум",
    ]);
    expect(hrZoneName(mkT, { name: "AeT" })).toBe("AeT");
  });

  it("gives the Garmin term for subtitles", () => {
    expect(garminTerm("trainingReadiness.title")).toBe("Training Readiness");
    expect(mk["trainingReadiness.title"]).toBe("Спремност за тренинг");
  });
});

describe("formatter", () => {
  const mkF = createFormatter(createTranslator("mk"));
  const enF = createFormatter(createTranslator("en"));
  const enImp = createFormatter(createTranslator("en"), "imperial");

  it("formats distances, elevation and weight per locale and unit system", () => {
    expect(mkF.distance(14_300)).toBe("14,3 km");
    expect(enF.distance(14_300)).toBe("14.3 km");
    expect(enImp.distance(16_093.44)).toBe("10 mi");
    expect(mkF.elevation(106.4)).toBe("106 m");
    expect(enImp.elevation(100)).toBe("328 ft");
    expect(mkF.weight(72_500)).toBe("72,5 kg");
    expect(enImp.weight(72_500)).toBe("159.8 lb");
    expect(mkF.number(1234.567)).toBe("1.234,57");
    expect(enF.number(1234.567, 0)).toBe("1,235");
    expect(mkF.percent(25)).toMatch(/^25\s?%$/);
  });

  it("formats pace, duration and heart rate", () => {
    expect(mkF.pace(325)).toBe("5:25 /km");
    expect(enImp.pace(325)).toBe("8:43 /mi");
    expect(mkF.pace(null)).toBe("");
    expect(mkF.pace(0)).toBe("");
    expect(mkF.duration(4572)).toBe("1:16:12");
    expect(mkF.duration(2703)).toBe("45:03");
    expect(mkF.duration(-1)).toBe("");
    expect(mkF.duration(null)).toBe("");
    expect(mkF.heartRate(152)).toBe("152 уд/мин");
    expect(enF.heartRate(152)).toBe("152 bpm");
  });

  it("formats totals, temperature, wind and unit values per unit system", () => {
    expect(mkF.totalTime(5 * 3600 + 12 * 60 + 20)).toBe("5 ч 12 мин");
    expect(enF.totalTime(45 * 60)).toBe("45 min");
    expect(enF.totalTime(null)).toBe("");
    expect(mkF.temperature(12.4)).toBe("12°");
    expect(enImp.temperature(12)).toBe("54°");
    expect([mkF.temperatureUnit, enImp.temperatureUnit]).toEqual(["°C", "°F"]);
    expect(mkF.windSpeed(16)).toBe("16 km/h");
    expect(enImp.windSpeed(16)).toBe("10 mph");
    expect([mkF.distanceUnit, enImp.distanceUnit]).toEqual(["km", "mi"]);
    expect(mkF.distanceValue(12_500)).toBe(12.5);
    expect(enImp.distanceValue(16_093.44)).toBeCloseTo(10);
    expect(enImp.toMeters(10)).toBeCloseTo(16_093.44);
    expect(mkF.toMeters(12.5)).toBe(12_500);
  });

  it("formats calendar dates and lists", () => {
    expect(mkF.date("2026-11-19")).toBe("четврток, 19 ноември");
    expect(enF.date("2026-11-19")).toBe("Thursday, November 19");
    expect(mkF.date("2026-11-19", "dayMonth")).toBe("19 ноември");
    expect(enF.date("2026-11-19", "short")).toBe("11/19/2026");
    expect(mkF.date("2026-11-19", "weekday")).toBe("четврток");
    expect(enF.date("2026-11-19", "monthYear")).toBe("November 2026");
    expect(() => mkF.date("nope")).toThrow(RangeError);
    expect(mkF.list(["Garmin", "Polar", "COROS"])).toBe("Garmin, Polar и COROS");
    expect(mkF.unitSystem).toBe("metric");
    expect(enImp.locale).toBe("en");
  });
});

describe("pseudo-localization", () => {
  it("accents text, keeps placeholders and ICU syntax, pads for expansion", () => {
    const p = pseudoLocalize("Hi {name}, {count, plural, one {# day} other {# days}}");
    expect(p.startsWith("[Ĥí {name}, {count, plural, one {# đȧý} other {# đȧýŝ}}")).toBe(true);
    expect(p.endsWith("~]")).toBe(true);
    expect(messageArguments(p.slice(1, p.lastIndexOf(" ")))).toEqual(new Set(["name", "count"]));
    const catalog = pseudoCatalog({ a: "Run" });
    expect(catalog.a).toBe("[Řüñ ~~]");
    expect(validateCatalogs({ en: CATALOGS.en, "en-XA": pseudoCatalog(CATALOGS.en) })).toEqual([]);
  });
});
