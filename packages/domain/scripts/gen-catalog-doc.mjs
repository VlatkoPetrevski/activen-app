// Generates docs/data-catalog-fields.md from the compiled catalog. Run: pnpm --filter @activen/domain catalog:doc
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CATALOG, CATALOG_VENDORS, DOMAINS, vendorCoverage } from "../dist/catalog/index.js";

const out = fileURLToPath(new URL("../../../docs/data-catalog-fields.md", import.meta.url));
const VENDOR_NAMES = { garmin: "Garmin", polar: "Polar", suunto: "Suunto", coros: "COROS" };
const DOMAIN_NAMES = {
  activities: "Activities — активности (резиме)",
  activity_laps: "Activity laps — кругови",
  activity_samples: "Activity samples — временски серии",
  dailies: "Dailies — дневно резиме",
  epochs: "Epochs — 15-минутни интервали",
  sleeps: "Sleeps — сон",
  hrv: "HRV — варијабилност на пулс (ноќ)",
  stress_details: "Stress details — стрес и Body Battery",
  respiration: "Respiration — дишење",
  pulse_ox: "Pulse Ox — SpO2",
  skin_temp: "Skin temperature — температура на кожа",
  health_snapshot: "Health Snapshot — моментални мерења",
  body_comps: "Body composition — состав на тело",
  blood_pressure: "Blood pressure — крвен притисок",
  user_metrics: "User metrics — фитнес метрики",
  training_status: "Training status — спремност, оптоварување, статус",
  profile: "Profile — профил",
  workouts: "Workouts (Training API) — планирани тренинзи кон часовник",
  courses: "Courses (Courses API) — рути",
};
const MARK = { documented: "✅", fit_profile: "🟦", to_confirm: "❓" };
const esc = (s) => String(s).replaceAll("|", "\\|");
const cell = (m) =>
  m
    ? `${MARK[m.status]} \`${esc(m.path)}\`${m.transform !== "none" ? ` ⟶ ${m.transform}` : ""}${m.note ? `<br>_${esc(m.note)}_` : ""}`
    : "—";
const origin = (o) =>
  o === "common" ? "заедничко" : o === "activen" ? "ActiveN" : `${VENDOR_NAMES[o]} (своја метрика)`;

let md = `# Каталог на податоци — полиња и мапирање

> **Генериран документ** од \`packages/domain/src/catalog/fields.ts\` — не се уредува рачно.
> Објаснувањето и одлуките се во [data-catalog.md](data-catalog.md).

Клучевите следат Garmin терминологија: \`<summary type>.<Garmin име на поле>\`, со Garmin единици.

Легенда: ✅ потврдено во јавна документација · 🟦 стандардно поле во FIT профилот · ❓ намената е позната, името/единицата треба да се потврди во партнерската документација · — нема.

## Покриеност по вендор

| Вендор | ✅ | 🟦 | ❓ | Заеднички полиња без податок |
| --- | --- | --- | --- | --- |
`;
for (const v of CATALOG_VENDORS) {
  const c = vendorCoverage(v);
  md += `| ${VENDOR_NAMES[v]} | ${c.documented} | ${c.fitProfile} | ${c.toConfirm} | ${c.missing} |\n`;
}
md += `\nВкупно канонски полиња: **${CATALOG.length}**.\n`;

for (const d of DOMAINS) {
  const fields = CATALOG.filter((f) => f.domain === d);
  md += `\n## ${DOMAIN_NAMES[d]}\n\n| Канонско поле | Ед. | Опис | Потекло | Garmin | Polar | Suunto | COROS |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n`;
  for (const f of fields) {
    const label =
      esc(f.label) +
      (f.note ? `<br>_${esc(f.note)}_` : "") +
      (f.sensitivity !== "standard" ? ` 🔒${f.sensitivity === "special" ? "🔒" : ""}` : "");
    md += `| \`${f.key}\` | ${f.unit} | ${label} | ${origin(f.origin)} | ${CATALOG_VENDORS.map((v) => cell(f.mappings[v])).join(" | ")} |\n`;
  }
}
md += `\n🔒 здравствен податок (согласност) · 🔒🔒 посебна категорија (не се прикажува на тренер, не се увезува без изрична потреба)\n`;
writeFileSync(out, md);
console.log(`wrote ${out} (${CATALOG.length} fields)`);
