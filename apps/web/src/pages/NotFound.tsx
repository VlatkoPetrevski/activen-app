import { Link } from "react-router";
import { useI18n } from "../i18n/I18nContext.js";

export function NotFound() {
  const { t } = useI18n();
  return (
    <div className="auth-page">
      <div className="auth-card card stack" style={{ textAlign: "center" }}>
        <h1>404</h1>
        <Link className="btn btn-primary" to="/">
          {t("nav.today")}
        </Link>
      </div>
    </div>
  );
}
