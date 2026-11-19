import { useQuery } from "@tanstack/react-query";
import { useApi } from "../api/ApiContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import { ProgressView } from "../training/ProgressView.js";
import { QueryView } from "../ui/States.js";

export function ProgressPage() {
  const api = useApi();
  const { t } = useI18n();
  const query = useQuery({ queryKey: ["me", "progress", 12], queryFn: () => api.progress(12) });
  return (
    <div className="stack-l">
      <h1>{t("nav.progress")}</h1>
      <QueryView query={query}>{(data) => <ProgressView data={data} />}</QueryView>
    </div>
  );
}
