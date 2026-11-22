import { useI18n } from "../i18n/I18nContext.js";
import { Icon } from "./Icon.js";

/** Page numbers to show: all when few, otherwise the ends and the neighbours of the current one. */
export function pageItems(page: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => keep.add(p));
  if (page >= pages - 2) [pages - 3, pages - 2, pages - 1].forEach((p) => keep.add(p));
  const sorted = [...keep].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - (sorted[i - 1] ?? p) > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

/** Numbered pages (‹ 1 2 3 ›) under a list; nothing when everything fits on one page. */
export function Pager({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange(page: number): void;
}) {
  const { t } = useI18n();
  if (pages <= 1) return null;
  return (
    <nav className="pager" aria-label={t("pager.label")}>
      <button
        type="button"
        className="icon-btn"
        aria-label={t("pager.prev")}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <Icon name="chevronLeft" size={16} />
      </button>
      {pageItems(page, pages).map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className="pager-gap" aria-hidden>
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className="pager-page num"
            aria-label={t("pager.page", { page: p })}
            aria-current={p === page ? "page" : undefined}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        className="icon-btn"
        aria-label={t("pager.next")}
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        <Icon name="chevronRight" size={16} />
      </button>
    </nav>
  );
}
