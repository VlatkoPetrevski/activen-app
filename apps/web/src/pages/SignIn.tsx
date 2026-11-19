import type { SignInResponse } from "@activen/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { ApiError } from "../api/api.js";
import { useApi } from "../api/ApiContext.js";
import { useAuth } from "../auth/AuthContext.js";
import { renderGoogleButton, signInWithApple } from "../auth/social.js";
import { useI18n } from "../i18n/I18nContext.js";
import type { T } from "../i18n/I18nContext.js";
import { LanguageSwitch } from "../ui/LanguageSwitch.js";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const APPLE_CLIENT_ID = import.meta.env.VITE_APPLE_CLIENT_ID as string | undefined;

export function signInError(t: T, e: unknown): string {
  if (e instanceof ApiError && e.code === "account_exists")
    return t("auth.accountExists", {
      providers: (e.providers ?? [])
        .map((p) => t(`auth.provider.${p}` as "auth.provider.email"))
        .join(", "),
    });
  if (e instanceof ApiError && e.status === 404) return t("auth.providerUnavailable");
  if (e instanceof ApiError && e.status === 401) return t("auth.email.invalid");
  return t("common.error");
}

export function SignInPage() {
  const api = useApi();
  const { status, reload } = useAuth();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const providers = useQuery({ queryKey: ["providers"], queryFn: () => api.providers() });
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const googleRef = useRef<HTMLDivElement>(null);

  const finish = async (res: SignInResponse | undefined, to = from) => {
    await reload();
    navigate(res?.created ? "/welcome" : to, { replace: true });
  };
  const attempt = async (fn: () => Promise<SignInResponse | undefined>, to?: string) => {
    setBusy(true);
    setError(null);
    try {
      // Stay "busy" on success: the page is leaving, and clearing it would redirect to `from`.
      await finish(await fn(), to);
    } catch (e) {
      setError(signInError(t, e));
      setBusy(false);
    }
  };

  const googleOn = Boolean(GOOGLE_CLIENT_ID && providers.data?.google);
  useEffect(() => {
    if (!googleOn || !googleRef.current || !GOOGLE_CLIENT_ID) return;
    void renderGoogleButton(
      googleRef.current,
      GOOGLE_CLIENT_ID,
      locale,
      (idToken, nonce) => void attempt(() => api.signInWithIdToken("google", idToken, nonce)),
    ).catch(() => setError(t("common.error")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleOn, locale]);

  if (status === "signedIn" && !busy) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.startEmailSignIn(email.trim(), locale);
      setSent(email.trim());
    } catch (err) {
      setError(signInError(t, err));
    } finally {
      setBusy(false);
    }
  };

  const signInDemo = api.signInDemo?.bind(api);
  const appleOn = Boolean(APPLE_CLIENT_ID && providers.data?.apple);
  const emailOn = providers.data?.email ?? false;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="row-between">
          <span className="brand">
            <img src="./icon.svg" alt="" width={32} height={32} />
            ActiveN
          </span>
          <LanguageSwitch />
        </div>
        <div className="card stack-l" style={{ padding: 24 }}>
          <div className="stack" style={{ gap: 6 }}>
            <h1>{t("auth.title")}</h1>
            <p className="muted">{t("auth.subtitle")}</p>
          </div>

          {api.mode === "demo" && signInDemo && (
            <div className="stack">
              <p className="small muted">{t("auth.demo.intro")}</p>
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={busy}
                onClick={() => void attempt(async () => void (await signInDemo("athlete")))}
              >
                {t("auth.demo.athlete")}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-block"
                disabled={busy}
                onClick={() => void attempt(async () => void (await signInDemo("coach")), "/coach")}
              >
                {t("auth.demo.coach")}
              </button>
            </div>
          )}

          {googleOn && <div ref={googleRef} style={{ minHeight: 44 }} />}
          {appleOn && APPLE_CLIENT_ID && (
            <button
              type="button"
              className="btn btn-block"
              style={{ background: "#000", color: "#fff" }}
              disabled={busy}
              onClick={() =>
                void attempt(async () => {
                  const r = await signInWithApple(APPLE_CLIENT_ID);
                  return api.signInWithIdToken("apple", r.idToken, r.nonce, r.name);
                })
              }
            >
              {t("auth.apple")}
            </button>
          )}
          {(googleOn || appleOn) && emailOn && <div className="or">{t("auth.or")}</div>}

          {emailOn &&
            (sent ? (
              <div className="alert info" role="status">
                {t("auth.email.sent", { email: sent })}
              </div>
            ) : (
              <form className="stack" onSubmit={submit}>
                <div className="field">
                  <label htmlFor="email">{t("auth.email.label")}</label>
                  <input
                    id="email"
                    className="input"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                  {t("auth.email.submit")}
                </button>
              </form>
            ))}

          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {providers.isError && <div className="alert error">{t("common.error")}</div>}
          <p className="tiny muted">{t("auth.terms")}</p>
        </div>
      </div>
    </div>
  );
}
