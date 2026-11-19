import { useApi } from "../api/ApiContext.js";
import { useAuth } from "../auth/AuthContext.js";
import { useI18n } from "../i18n/I18nContext.js";

export function DemoBanner() {
  const api = useApi();
  const { signOut } = useAuth();
  const { t } = useI18n();
  if (api.mode !== "demo") return null;
  return (
    <div className="demo-banner" role="note">
      {t("demo.banner")}
      <button type="button" onClick={() => void signOut()}>
        {t("demo.exit")}
      </button>
    </div>
  );
}
