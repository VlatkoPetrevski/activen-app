import type { ActivityDetailDto } from "@activen/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useParams } from "react-router";
import { useApi } from "../api/ApiContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import {
  availableStats,
  availableTemplates,
  defaultStats,
  defaultTemplate,
  figureFor,
  MAX_STATS,
  shareFileName,
  toggleStat,
  trimRoute,
  type CardFormat,
  type StatKey,
  type Template,
  type Theme,
} from "../share/model.js";
import { renderCard } from "../share/render.js";
import { Icon } from "../ui/Icon.js";
import { QueryView } from "../ui/States.js";

interface Photo {
  url: string;
  image: HTMLImageElement;
  width: number;
  height: number;
}

const FORMAT_KEYS: CardFormat[] = ["story", "portrait", "square"];
const THEMES: Theme[] = ["ember", "night", "light"];

function Choice<V extends string>({
  label,
  values,
  value,
  text,
  onChange,
}: {
  label: string;
  values: readonly V[];
  value: V;
  text(v: V): string;
  onChange(v: V): void;
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          className="chip chip-button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {text(v)}
        </button>
      ))}
    </div>
  );
}

function Studio({ detail }: { detail: ActivityDetailDto }) {
  const { t, f } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const templates = availableTemplates(detail);
  const all = useMemo(() => availableStats(detail, f, t), [detail, f, t]);
  const [template, setTemplate] = useState<Template>(defaultTemplate(detail));
  const [format, setFormat] = useState<CardFormat>("story");
  const [theme, setTheme] = useState<Theme>("ember");
  const [selected, setSelected] = useState<StatKey[]>(() =>
    defaultStats(detail).filter((k) => all.some((s) => s.key === k)),
  );
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [photoRoute, setPhotoRoute] = useState(true);
  const [hideEnds, setHideEnds] = useState(true);
  const [fontsReady, setFontsReady] = useState(false);
  const [status, setStatus] = useState<"idle" | "busy" | "shared" | "saved" | "error">("idle");
  const a = detail.activity;

  useEffect(() => {
    let alive = true;
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    void (fonts?.ready ?? Promise.resolve()).then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => () => (photo ? URL.revokeObjectURL(photo.url) : undefined), [photo]);

  const route = useMemo(() => {
    const pts = detail.route?.points as [number, number][] | undefined;
    if (!pts || pts.length < 2) return null;
    return hideEnds ? trimRoute(pts, 200) : pts;
  }, [detail.route, hideEnds]);
  const stats = useMemo(() => all.filter((s) => selected.includes(s.key)), [all, selected]);

  useEffect(() => {
    if (!canvas.current) return;
    renderCard(canvas.current, {
      format,
      template,
      theme,
      photo: photo?.image ?? null,
      photoSize: photo ? { width: photo.width, height: photo.height } : null,
      photoRoute,
      title: a.activityName,
      subtitle: f.date(a.calendarDate, "long"),
      stats,
      route,
      laps: detail.laps,
      figure: figureFor(a.activityType),
    });
  }, [format, template, theme, photo, photoRoute, stats, route, detail.laps, a, f, fontsReady]);

  const onPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError(false);
    // The photo stays in this browser: it is drawn on the canvas, never uploaded.
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setPhoto({ url, image, width: image.naturalWidth, height: image.naturalHeight });
      setTemplate("photo");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setPhotoError(true);
    };
    image.src = url;
  };

  const blob = () =>
    new Promise<Blob | null>((resolve) => {
      const c = canvas.current;
      if (!c || typeof c.toBlob !== "function") return resolve(null);
      c.toBlob(resolve, "image/png");
    });

  const download = async () => {
    setStatus("busy");
    const b = await blob();
    if (!b) return setStatus("error");
    const url = URL.createObjectURL(b);
    const link = document.createElement("a");
    link.href = url;
    link.download = shareFileName(detail);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("saved");
  };

  const canShareFiles =
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    typeof File !== "undefined";
  const share = async () => {
    setStatus("busy");
    const b = await blob();
    if (!b) return setStatus("error");
    const file = new File([b], shareFileName(detail), { type: "image/png" });
    if (!navigator.canShare({ files: [file] })) return download();
    try {
      await navigator.share({ files: [file], title: a.activityName });
      setStatus("shared");
    } catch (err) {
      // Closing the share sheet is not an error; any other failure falls back to a download.
      if (err instanceof DOMException && err.name === "AbortError") setStatus("idle");
      else await download();
    }
  };

  const needsPhoto = template === "photo" && !photo;
  return (
    <div className="share-studio">
      <div className="share-preview">
        <div className={`share-frame ${format}`}>
          <canvas ref={canvas} role="img" aria-label={t("share.preview")} />
          {needsPhoto && (
            <label className="share-drop">
              <Icon name="plus" size={28} />
              <span>{t("share.addPhoto")}</span>
              <input type="file" accept="image/*" onChange={onPhoto} className="sr-only" />
            </label>
          )}
        </div>
      </div>

      <div className="share-controls stack">
        <section className="stack-s">
          <h3>{t("share.background")}</h3>
          <div className="template-grid" role="group" aria-label={t("share.background")}>
            {templates.map((k) => (
              <button
                key={k}
                type="button"
                className="template-card"
                aria-pressed={template === k}
                onClick={() => setTemplate(k)}
              >
                <Icon
                  name={
                    k === "photo"
                      ? "sun"
                      : k === "route"
                        ? "pin"
                        : k === "intervals"
                          ? "progress"
                          : k === "bold"
                            ? "activities"
                            : figureFor(a.activityType) === "cyclist"
                              ? "bike"
                              : figureFor(a.activityType) === "lifter"
                                ? "gym"
                                : "run"
                  }
                  size={22}
                />
                <span>{t(`share.template.${k}`)}</span>
              </button>
            ))}
          </div>
          {template === "photo" && (
            <div className="row wrap">
              <label className="btn btn-secondary btn-small">
                <Icon name="plus" size={16} />{" "}
                {photo ? t("share.changePhoto") : t("share.addPhoto")}
                <input type="file" accept="image/*" onChange={onPhoto} className="sr-only" />
              </label>
              {route && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={photoRoute}
                    onChange={(e) => setPhotoRoute(e.target.checked)}
                  />
                  {t("share.routeOnPhoto")}
                </label>
              )}
            </div>
          )}
          {photoError && <div className="alert error">{t("share.photoError")}</div>}
          {template === "photo" && <p className="tiny muted">{t("share.photoPrivate")}</p>}
        </section>

        {template !== "photo" && (
          <section className="stack-s">
            <h3>{t("share.theme")}</h3>
            <Choice<Theme>
              label={t("share.theme")}
              values={THEMES}
              value={theme}
              text={(v) => t(`share.theme.${v}`)}
              onChange={setTheme}
            />
          </section>
        )}

        <section className="stack-s">
          <h3>{t("share.format")}</h3>
          <Choice<CardFormat>
            label={t("share.format")}
            values={FORMAT_KEYS}
            value={format}
            text={(v) => t(`share.format.${v}`)}
            onChange={setFormat}
          />
        </section>

        <section className="stack-s">
          <h3>
            {t("share.stats")}{" "}
            <span className="small muted">
              {selected.length}/{MAX_STATS}
            </span>
          </h3>
          <div className="chips" role="group" aria-label={t("share.stats")}>
            {all.map((s) => {
              const on = selected.includes(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  className="chip chip-button"
                  aria-pressed={on}
                  disabled={!on && selected.length >= MAX_STATS}
                  onClick={() =>
                    setSelected((x) =>
                      toggleStat(
                        x,
                        s.key,
                        all.map((i) => i.key),
                      ),
                    )
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </section>

        {route && (
          <label className="check">
            <input
              type="checkbox"
              checked={hideEnds}
              onChange={(e) => setHideEnds(e.target.checked)}
            />
            {t("share.hideEnds")}
          </label>
        )}

        <div className="row wrap share-actions">
          {canShareFiles && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={status === "busy" || needsPhoto}
              onClick={() => void share()}
            >
              <Icon name="send" size={18} /> {t("share.share")}
            </button>
          )}
          <button
            type="button"
            className={canShareFiles ? "btn btn-secondary" : "btn btn-primary"}
            disabled={status === "busy" || needsPhoto}
            onClick={() => void download()}
          >
            <Icon name="arrowDown" size={18} /> {t("share.download")}
          </button>
        </div>
        {status === "saved" && <div className="alert success">{t("share.saved")}</div>}
        {status === "shared" && <div className="alert success">{t("share.shared")}</div>}
        {status === "error" && <div className="alert error">{t("share.error")}</div>}
      </div>
    </div>
  );
}

/** Share studio: a photo or a generated card with the numbers the athlete picks. */
export function SharePage() {
  const api = useApi();
  const { t } = useI18n();
  const { id = "" } = useParams();
  const query = useQuery({ queryKey: ["me", "activity", id], queryFn: () => api.activity(id) });
  return (
    <div className="stack-l">
      <Link to={`/activities/${id}`} className="back-link">
        <Icon name="chevronLeft" size={16} /> {t("share.back")}
      </Link>
      <h1>{t("share.title")}</h1>
      <QueryView query={query}>{(d) => <Studio detail={d} />}</QueryView>
    </div>
  );
}
