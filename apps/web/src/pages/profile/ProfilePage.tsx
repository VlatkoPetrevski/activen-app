import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useApi } from "../../api/ApiContext.js";
import { useAuth, useMe } from "../../auth/AuthContext.js";
import { useI18n } from "../../i18n/I18nContext.js";
import { Icon } from "../../ui/Icon.js";
import { QueryView } from "../../ui/States.js";
import { PreferenceSections } from "./PreferenceSections.js";
import { Section } from "./Section.js";

export function ProfilePage() {
  const api = useApi();
  const me = useMe();
  const { reload, signOut } = useAuth();
  const { t, f } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(me.user.displayName);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const sessions = useQuery({ queryKey: ["me", "sessions"], queryFn: () => api.sessions() });
  const isCoach = me.user.roles.includes("coach");

  /** Runs an account action; failures show one localized message instead of a stray rejection. */
  const run = async (fn: () => Promise<unknown>, after: () => Promise<unknown> = reload) => {
    setError(null);
    try {
      await fn();
      await after();
    } catch {
      setError(t("common.error"));
    }
  };
  const refreshSessions = () => queryClient.invalidateQueries({ queryKey: ["me", "sessions"] });
  const saveName = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && name.trim() !== me.user.displayName)
      void run(() => api.updateProfile(name.trim()));
  };

  return (
    <div className="stack-l">
      <div className="row-between">
        <h1>{t("nav.profile")}</h1>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={() => void signOut().then(() => navigate("/sign-in", { replace: true }))}
        >
          <Icon name="logout" size={16} /> {t("auth.signOut")}
        </button>
      </div>

      <Section title={t("profile.name")} info={me.user.displayName}>
        <form className="row" onSubmit={saveName}>
          <label className="sr-only" htmlFor="display-name">
            {t("profile.name")}
          </label>
          <input
            id="display-name"
            className="input grow"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!name.trim() || name.trim() === me.user.displayName}
          >
            {t("common.save")}
          </button>
        </form>
        <span className="small muted">{me.user.email}</span>
      </Section>

      <PreferenceSections />

      <Section title={t("profile.roles")}>
        <label className="check">
          <input
            type="checkbox"
            checked={isCoach}
            onChange={(e) =>
              void run(() => (e.target.checked ? api.addRole("coach") : api.removeRole("coach")))
            }
          />
          {t("profile.becomeCoach")}
        </label>
      </Section>

      <Section title={t("profile.signIn")}>
        <div className="list">
          {me.identities.map((i) => (
            <div key={i.id} className="list-item">
              <span className="grow">
                {t(`auth.provider.${i.provider}`)} <span className="muted small">{i.email}</span>
              </span>
              {me.identities.length > 1 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => void run(() => api.unlinkIdentity(i.id))}
                >
                  {t("profile.unlink")}
                </button>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title={t("profile.devices")}>
        <QueryView query={sessions}>
          {(list) => (
            <div className="list">
              {list.map((s) => (
                <div key={s.id} className="list-item">
                  <span className="grow small">
                    {s.current ? (
                      <strong>{t("profile.thisDevice")}</strong>
                    ) : (
                      (s.userAgent ?? "—").slice(0, 60)
                    )}
                    <span className="muted">
                      {" "}
                      ·{" "}
                      {t("profile.lastUsed", {
                        date: f.date(s.lastUsedAt.slice(0, 10), "dayMonth"),
                      })}
                    </span>
                  </span>
                  {!s.current && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => void run(() => api.revokeSession(s.id), refreshSessions)}
                    >
                      {t("auth.signOut")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </QueryView>
        {(sessions.data?.length ?? 0) > 1 && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void run(() => api.revokeOtherSessions(), refreshSessions)}
          >
            {t("profile.signOutOthers")}
          </button>
        )}
      </Section>

      <section className="card stack" style={{ borderColor: "var(--bad)" }}>
        <h2>{t("profile.delete")}</h2>
        <p className="small muted">{t("profile.deleteHint")}</p>
        <div className="row">
          <label className="sr-only" htmlFor="confirm-delete">
            DELETE
          </label>
          <input
            id="confirm-delete"
            className="input grow"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="DELETE"
          />
          <button
            type="button"
            className="btn btn-danger"
            disabled={confirm !== "DELETE"}
            onClick={() =>
              void run(
                () => api.deleteAccount(),
                async () => {
                  await signOut();
                  navigate("/sign-in", { replace: true });
                },
              )
            }
          >
            {t("common.delete")}
          </button>
        </div>
      </section>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <p className="tiny muted">{t("disclaimer.nutrition")}</p>
    </div>
  );
}
