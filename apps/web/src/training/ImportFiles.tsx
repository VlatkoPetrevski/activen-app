import type { ImportResultDto, ImportStatusDto } from "@activen/contracts";
import type { MessageKey } from "@activen/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router";
import { IMPORT_BATCH } from "../api/api.js";
import { useApi } from "../api/ApiContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import { vendorName } from "../lib/vendors.js";
import { Icon } from "../ui/Icon.js";

/** Files offered by a picker or a drop, in batches the server accepts. */
export function batches<T>(items: readonly T[], size = IMPORT_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type ImportState =
  | { phase: "idle" }
  | { phase: "working"; count: number }
  | { phase: "done"; results: ImportResultDto[] }
  | { phase: "error" };

/** Uploads files and refreshes everything that shows activities. */
export function useActivityImport() {
  const api = useApi();
  const queryClient = useQueryClient();
  const [state, setState] = useState<ImportState>({ phase: "idle" });
  const run = useCallback(
    async (files: readonly File[]) => {
      if (files.length === 0) return;
      setState({ phase: "working", count: files.length });
      try {
        const results: ImportResultDto[] = [];
        for (const batch of batches(files)) results.push(...(await api.importActivities(batch)));
        setState({ phase: "done", results });
        await queryClient.invalidateQueries({ queryKey: ["me"] });
      } catch {
        setState({ phase: "error" });
      }
    },
    [api, queryClient],
  );
  return { state, run, reset: () => setState({ phase: "idle" }) };
}

const ACCEPT = ".fit,.gpx,.tcx,application/gpx+xml,application/vnd.garmin.tcx+xml";

/** "Увези": opens the file picker (several files at once). */
export function ImportButton({ onFiles, busy }: { onFiles(files: File[]): void; busy: boolean }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-small"
        disabled={busy}
        aria-label={t("import.buttonLabel")}
        onClick={() => input.current?.click()}
      >
        <Icon name="upload" size={16} /> {t("import.button")}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        data-testid="import-input"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </>
  );
}

/**
 * Dropping files anywhere on the page imports them; the zone shows where while a file is dragged.
 * On touch devices (no dragging) the zone is hidden by CSS and the button does the job.
 */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: DragEvent) => [...e.dataTransfer.types].includes("Files");
  useEffect(() => {
    // Dropped outside the zone: the browser would otherwise open the file instead of the app.
    const stop = (e: globalThis.DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);
  return {
    dragging,
    handlers: {
      onDragEnter: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        depth.current += 1;
        setDragging(true);
      },
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      },
      onDragOver: (e: DragEvent) => {
        if (hasFiles(e)) e.preventDefault();
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        onFiles([...e.dataTransfer.files]);
      },
    },
  };
}

export function DropHint({ dragging }: { dragging: boolean }) {
  const { t } = useI18n();
  return (
    <div className={`drop-hint${dragging ? " active" : ""}`} aria-hidden="true">
      <Icon name="upload" size={18} />
      <span>{dragging ? t("import.dropActive") : t("import.drop")}</span>
      <span className="small muted">{t("import.formats")}</span>
    </div>
  );
}

const STATUS_ICON: Record<ImportStatusDto, "check" | "link" | "swap" | "alert"> = {
  imported: "check",
  merged: "link",
  duplicate: "swap",
  failed: "alert",
};

/** One line per file, a short total, and a link to each activity. */
export function ImportReport({ state, onClose }: { state: ImportState; onClose(): void }) {
  const { t, f } = useI18n();
  const titleId = useId();
  if (state.phase === "idle") return null;
  if (state.phase === "working")
    return (
      <div className="import-report" role="status">
        <span className="spinner" aria-hidden="true" />{" "}
        {t("import.working", { count: state.count })}
      </div>
    );
  if (state.phase === "error")
    return (
      <div className="alert error row-between" role="alert">
        <span>{t("import.failedRequest")}</span>
        <button type="button" className="icon-btn" aria-label={t("import.close")} onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
    );
  const counts = (["imported", "merged", "duplicate", "failed"] as const)
    .map((status) => ({
      status,
      count: state.results.filter((r) => r.status === status).length,
    }))
    .filter((c) => c.count > 0);
  return (
    <section className="card import-report" role="status" aria-labelledby={titleId}>
      <div className="row-between">
        <h2 id={titleId} className="card-title">
          {t("import.title")}:{" "}
          <span className="muted">
            {counts.map((c) => t(`import.count.${c.status}`, { count: c.count })).join(" · ")}
          </span>
        </h2>
        <button type="button" className="icon-btn" aria-label={t("import.close")} onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <ul className="import-list">
        {state.results.map((r, i) => (
          <li key={`${r.fileName}-${i}`} className={`import-row ${r.status}`}>
            <Icon name={STATUS_ICON[r.status]} size={16} />
            <div className="stack" style={{ gap: 2, minWidth: 0 }}>
              <span className="import-file">{r.fileName}</span>
              <span className="small muted">
                {r.status === "merged" && r.mergedWith
                  ? t("import.status.merged", { source: vendorName(r.mergedWith) })
                  : t(`import.status.${r.status}`)}
                {r.calendarDate && ` · ${r.activityName ?? ""} · ${f.date(r.calendarDate, "long")}`}
              </span>
              {r.status === "merged" && r.mergedWith && (
                <span className="small muted">
                  {t("import.mergedHint", { source: vendorName(r.mergedWith) })}
                </span>
              )}
              {r.status === "duplicate" && (
                <span className="small muted">{t("import.duplicateHint")}</span>
              )}
              {r.error && (
                <span className="small">{t(`import.error.${r.error}` as MessageKey)}</span>
              )}
            </div>
            {r.activityId && (
              <Link className="btn btn-ghost btn-small" to={`/activities/${r.activityId}`}>
                {t("activities.open")}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
