import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { useApi } from "../../api/ApiContext.js";
import { useI18n } from "../../i18n/I18nContext.js";
import { relativeDay, todayIn } from "../../lib/dates.js";
import { VENDOR_NAMES } from "../../lib/vendors.js";
import type { SettingsEditor } from "../../settings/useSettingsEditor.js";
import { ImportButton, ImportReport, useActivityImport } from "../../training/ImportFiles.js";
import { Icon } from "../../ui/Icon.js";
import { ConnectedApps, isPolarResult } from "./ConnectedApps.js";
import { Section } from "./Section.js";

/**
 * Where activities come from: connected apps first (they sync by themselves), files from a watch
 * as the fallback, and the order in which sources are trusted when the same workout comes from
 * several of them (it is shown once, from the first).
 */
export function SourcesSection({ editor }: { editor: SettingsEditor }) {
  const api = useApi();
  const { t, f } = useI18n();
  const { settings, save, saving } = editor;
  const importer = useActivityImport();
  const [params] = useSearchParams();
  const polarResult = params.get("polar");
  const result = isPolarResult(polarResult) ? polarResult : null;
  const imports = useQuery({ queryKey: ["me", "imports"], queryFn: () => api.imports() });
  const order = settings.sourcePriority;
  const move = (i: number, dir: -1 | 1) => {
    const next = [...order];
    const [item] = next.splice(i, 1);
    if (!item) return;
    next.splice(i + dir, 0, item);
    void save({ sourcePriority: next });
  };
  const last = imports.data?.lastImportAt;
  const lastDay = last ? last.slice(0, 10) : null;
  const today = todayIn(settings.timeZone);
  const rel = lastDay ? relativeDay(lastDay, today) : null;
  return (
    <Section
      title={t("profile.sources")}
      info={order.map((v) => VENDOR_NAMES[v]).join(" › ")}
      defaultOpen={result !== null}
    >
      <ConnectedApps result={result} />
      <div className="stack" style={{ gap: 6 }}>
        <h3 className="sub-label">{t("sources.files")}</h3>
        <div className="list-item">
          <Icon name="file" size={18} />
          <span className="grow small">
            {imports.data ? t("sources.filesSummary", { count: imports.data.imported }) : "…"}
            {lastDay &&
              ` · ${t("sources.lastImport", {
                when: rel ? t(`common.${rel}`) : f.date(lastDay, "long"),
              })}`}
          </span>
          <ImportButton
            busy={importer.state.phase === "working"}
            onFiles={(files) => void importer.run(files)}
          />
        </div>
        <p className="small muted">{t("sources.filesHint")}</p>
        <ImportReport state={importer.state} onClose={importer.reset} />
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <h3 className="sub-label">{t("sources.priority")}</h3>
        <p className="small muted">{t("profile.sourcesHint")}</p>
        <ol className="list" style={{ padding: 0, margin: 0, listStyle: "none" }}>
          {order.map((v, i) => (
            <li key={v} className="list-item">
              <span className="chip num">{i + 1}</span>
              <span className="grow">{VENDOR_NAMES[v] ?? v}</span>
              <button
                type="button"
                className="icon-btn"
                disabled={saving || i === 0}
                aria-label={`${t("profile.moveUp")}: ${VENDOR_NAMES[v]}`}
                onClick={() => move(i, -1)}
              >
                <Icon name="arrowUp" size={18} />
              </button>
              <button
                type="button"
                className="icon-btn"
                disabled={saving || i === order.length - 1}
                aria-label={`${t("profile.moveDown")}: ${VENDOR_NAMES[v]}`}
                onClick={() => move(i, 1)}
              >
                <Icon name="arrowDown" size={18} />
              </button>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
