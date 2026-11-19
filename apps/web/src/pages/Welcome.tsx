import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useApi } from "../api/ApiContext.js";
import { useAuth, useMe } from "../auth/AuthContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import { LanguageSwitch } from "../ui/LanguageSwitch.js";

/** First sign-in: name, language, whether the person also coaches; devices come next version. */
export function WelcomePage() {
  const api = useApi();
  const me = useMe();
  const { reload } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState(me.user.displayName);
  const [coach, setCoach] = useState(me.user.roles.includes("coach"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      if (name.trim() && name.trim() !== me.user.displayName) await api.updateProfile(name.trim());
      if (coach && !me.user.roles.includes("coach")) await api.addRole("coach");
      await reload();
      navigate(coach ? "/coach" : "/", { replace: true });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card card stack-l" style={{ padding: 24 }} onSubmit={submit}>
        <div className="row-between">
          <h1>{t("onboarding.title")}</h1>
          <LanguageSwitch onChange={(locale) => void api.updateSettings({ locale })} />
        </div>
        <div className="field">
          <label htmlFor="name">{t("onboarding.name")}</label>
          <input
            id="name"
            className="input"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <span className="label">{t("onboarding.role")}</span>
          <label className="check">
            <input type="checkbox" checked disabled /> {t("onboarding.role.athlete")}
          </label>
          <label className="check">
            <input type="checkbox" checked={coach} onChange={(e) => setCoach(e.target.checked)} />{" "}
            {t("onboarding.role.coach")}
          </label>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h3>{t("onboarding.devices")}</h3>
          <div className="row wrap">
            {["Garmin", "Polar", "Suunto", "COROS"].map((v) => (
              <span key={v} className="chip">
                {v}
              </span>
            ))}
          </div>
          <p className="small muted">{t("onboarding.devices.hint")}</p>
        </div>
        {error && <div className="alert error">{t("common.error")}</div>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {t("onboarding.finish")}
        </button>
      </form>
    </div>
  );
}
