import { useApi } from "../api/ApiContext.js";
import { useAuth } from "../auth/AuthContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import { useIsMobile } from "../lib/useIsMobile.js";

/** True when the app is the page itself, not inside the phone view's frame. */
const topLevel = () => {
  try {
    return window.top === window.self;
  } catch {
    return false;
  }
};

export function DemoBanner() {
  const api = useApi();
  const { signOut } = useAuth();
  const { t } = useI18n();
  const mobile = useIsMobile();
  if (api.mode !== "demo") return null;
  return (
    <div className="demo-banner" role="note">
      {t("demo.banner")}
      <button type="button" onClick={() => void signOut()}>
        {t("demo.exit")}
      </button>
      {!mobile && topLevel() && (
        <a href="./phone.html" target="_top">
          {t("demo.phoneView")}
        </a>
      )}
    </div>
  );
}
