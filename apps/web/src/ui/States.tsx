import type { ReactNode } from "react";
import { ApiError } from "../api/api.js";
import { useI18n } from "../i18n/I18nContext.js";

export function Loading() {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite">
      <div className="spinner" />
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t } = useI18n();
  const detail =
    error instanceof ApiError && error.status >= 400 && error.status < 500 ? error.message : null;
  return (
    <div className="alert error" role="alert">
      <div className="row-between">
        <span>{detail ?? t("common.error")}</span>
        {retry && (
          <button type="button" className="btn btn-small btn-secondary" onClick={retry}>
            {t("common.retry")}
          </button>
        )}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Renders loading / error / content for a query. */
export function QueryView<T>({
  query,
  children,
}: {
  query: { data: T | undefined; error: unknown; isPending: boolean; refetch(): unknown };
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <Loading />;
  if (query.error || query.data === undefined)
    return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  return <>{children(query.data)}</>;
}
