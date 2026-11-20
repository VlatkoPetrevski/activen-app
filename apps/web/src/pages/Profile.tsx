import { VENDORS, type AthleteSettings, type Vendor } from "@activen/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { SettingsInput } from "../api/api.js";
import { useApi } from "../api/ApiContext.js";
import { useAuth, useMe } from "../auth/AuthContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import { VENDOR_NAMES } from "../lib/vendors.js";
import { Icon } from "../ui/Icon.js";
import { LanguageSwitch } from "../ui/LanguageSwitch.js";
import { Segment } from "../ui/Segment.js";
import { QueryView } from "../ui/States.js";

const TIME_ZONES = (() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["Europe/Skopje"];
  }
})();

/** A profile section: title and the current value collapsed, the form on expand. */
function Section({
  title,
  info,
  children,
}: {
  title: string;
  /** Current value shown while collapsed. */
  info?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <Segment
      label={title}
      summary={
        <span className="seg-line">
          <strong>{title}</strong>
          {info && <span className="small muted">{info}</span>}
        </span>
      }
    >
      <div className="stack">{children}</div>
    </Segment>
  );
}

function SettingsForm({ settings: stored }: { settings: AthleteSettings }) {
  const api = useApi();
  const { reload } = useAuth();
  const { t, locale } = useI18n();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  // Optimistic: the change shows at once and is rolled back when saving fails.
  const [pending, setPending] = useState<SettingsInput | null>(null);
  const settings = { ...stored, ...pending } as AthleteSettings;
  const save = async (patch: SettingsInput) => {
    setSaving(true);
    setError(false);
    setPending((p) => ({ ...p, ...patch }));
    try {
      await api.updateSettings(patch);
      await reload();
    } catch {
      setError(true);
    } finally {
      setPending(null);
      setSaving(false);
    }
  };
  const order = settings.sourcePriority;
  const move = (i: number, dir: -1 | 1) => {
    const next = [...order];
    const [item] = next.splice(i, 1);
    if (!item) return;
    next.splice(i + dir, 0, item);
    void save({ sourcePriority: next });
  };
  const hr = settings.hrZones;
  return (
    <>
      <Section
        title={t("profile.language")}
        info={`${locale.toUpperCase()} · ${t(`profile.units.${settings.unitSystem}`)}`}
      >
        <div className="form-grid">
          <div className="field">
            <span className="label">{t("profile.language")}</span>
            <LanguageSwitch onChange={(locale) => void save({ locale })} />
          </div>
          <div className="field">
            <span className="label">{t("profile.units")}</span>
            <div className="segmented" role="group">
              {(["metric", "imperial"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={settings.unitSystem === u}
                  disabled={saving}
                  onClick={() => void save({ unitSystem: u })}
                >
                  {t(`profile.units.${u}`)}
                </button>
              ))}
            </div>
            <span className="small muted">{t("profile.units.hint")}</span>
          </div>
          <div className="field full">
            <label htmlFor="tz">{t("profile.timeZone")}</label>
            <select
              id="tz"
              className="input"
              value={settings.timeZone}
              disabled={saving}
              onChange={(e) => void save({ timeZone: e.target.value })}
            >
              {TIME_ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Section>
      <Section
        title={t("profile.planning")}
        info={t(settings.workoutSuggestions ? "profile.suggestions.on" : "profile.suggestions.off")}
      >
        <label className="check">
          <input
            type="checkbox"
            checked={settings.workoutSuggestions}
            disabled={saving}
            onChange={(e) => void save({ workoutSuggestions: e.target.checked })}
          />
          {t("profile.suggestions")}
        </label>
        <p className="small muted">{t("profile.suggestionsHint")}</p>
      </Section>
      <Section title={t("profile.sources")} info={order.map((v) => VENDOR_NAMES[v]).join(" › ")}>
        <p className="small muted">{t("profile.sourcesHint")}</p>
        <ol className="list" style={{ padding: 0, margin: 0, listStyle: "none" }}>
          {order.map((v, i) => (
            <li key={v} className="list-item">
              <span className="chip num">{i + 1}</span>
              <span className="grow">{VENDOR_NAMES[v] ?? v}</span>
              <button
                type="button"
                className="icon-btn"
                disabled={saving || i === 0}
                aria-label={`${t("profile.moveUp")}: ${VENDOR_NAMES[v]}`}
                onClick={() => move(i, -1)}
              >
                <Icon name="arrowUp" size={18} />
              </button>
              <button
                type="button"
                className="icon-btn"
                disabled={saving || i === order.length - 1}
                aria-label={`${t("profile.moveDown")}: ${VENDOR_NAMES[v]}`}
                onClick={() => move(i, 1)}
              >
                <Icon name="arrowDown" size={18} />
              </button>
            </li>
          ))}
        </ol>
      </Section>
      <Section
        title={t("profile.hrZones")}
        info={settings.maxHeartRate ? `max ${settings.maxHeartRate}` : undefined}
      >
        <div className="stack" style={{ gap: 0 }}>
          {(["source", "vendor", "manual"] as const).map((mode) => (
            <label key={mode} className="check">
              <input
                type="radio"
                name="hr-mode"
                checked={hr.mode === mode}
                disabled={saving}
                onChange={() =>
                  void save({ hrZones: mode === "vendor" ? { mode, vendor: "garmin" } : { mode } })
                }
              />
              {t(`profile.hrZones.${mode}`)}
            </label>
          ))}
          {hr.mode === "vendor" && (
            <select
              className="input"
              aria-label={t("profile.hrZones.vendor")}
              value={hr.vendor}
              disabled={saving}
              onChange={(e) =>
                void save({
                  hrZones: { mode: "vendor", vendor: e.target.value as Exclude<Vendor, "manual"> },
                })
              }
            >
              {VENDORS.filter((v) => v !== "manual").map((v) => (
                <option key={v} value={v}>
                  {VENDOR_NAMES[v]}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="maxhr">{t("profile.maxHr")}</label>
            <input
              id="maxhr"
              className="input num"
              type="number"
              min={100}
              max={250}
              defaultValue={settings.maxHeartRate ?? ""}
              onBlur={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                if (v !== settings.maxHeartRate && (v === null || (v >= 100 && v <= 250)))
                  void save({ maxHeartRate: v });
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="birth">{t("profile.birthDate")}</label>
            <input
              id="birth"
              className="input"
              type="date"
              defaultValue={settings.birthDate ?? ""}
              onBlur={(e) => {
                const v = e.target.value || null;
                if (v !== settings.birthDate) void save({ birthDate: v });
              }}
            />
          </div>
        </div>
      </Section>
      {error && <div className="alert error">{t("common.error")}</div>}
    </>
  );
}

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

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  };
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

      <SettingsForm settings={me.settings} />

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
                      onClick={() =>
                        void api
                          .revokeSession(s.id)
                          .then(() =>
                            queryClient.invalidateQueries({ queryKey: ["me", "sessions"] }),
                          )
                      }
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
            onClick={() =>
              void api
                .revokeOtherSessions()
                .then(() => queryClient.invalidateQueries({ queryKey: ["me", "sessions"] }))
            }
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
              void api.deleteAccount().then(async () => {
                await signOut();
                navigate("/sign-in", { replace: true });
              })
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
