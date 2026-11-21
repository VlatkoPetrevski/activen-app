import { useI18n } from "../i18n/I18nContext.js";

export function SettingsError({ show }: { show: boolean }) {
  const { t } = useI18n();
  return show ? (
    <div className="alert error" role="alert">
      {t("common.error")}
    </div>
  ) : null;
}
