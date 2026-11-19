import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useApi } from "../api/ApiContext.js";
import { useAuth } from "../auth/AuthContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import { Loading } from "../ui/States.js";
import { signInError } from "./SignIn.js";

/** The token arrives in the URL fragment (never sent to servers); it is removed right away. */
function takeToken(): string | null {
  const match = /token=([\w-]+)/.exec(window.location.hash);
  if (match) window.history.replaceState(null, "", window.location.pathname);
  return match?.[1] ?? null;
}

export function EmailVerifyPage() {
  const api = useApi();
  const { reload } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = takeToken();
    if (!token) {
      setError(t("auth.email.invalid"));
      return;
    }
    api
      .verifyEmailSignIn(token)
      .then(async (res) => {
        await reload();
        navigate(res.created ? "/welcome" : "/", { replace: true });
      })
      .catch((e: unknown) => setError(signInError(t, e)));
  }, [api, navigate, reload, t]);

  return (
    <div className="auth-page">
      <div className="auth-card card stack">
        {error ? (
          <>
            <div className="alert error" role="alert">
              {error}
            </div>
            <Link className="btn btn-primary" to="/sign-in">
              {t("auth.title")}
            </Link>
          </>
        ) : (
          <>
            <p>{t("auth.email.verifying")}</p>
            <Loading />
          </>
        )}
      </div>
    </div>
  );
}

export function LinkEmailPage() {
  const api = useApi();
  const { reload } = useAuth();
  const { t } = useI18n();
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = takeToken();
    if (!token) {
      setState("error");
      return;
    }
    api
      .verifyEmailLink(token)
      .then(() => reload())
      .then(() => setState("done"))
      .catch(() => setState("error"));
  }, [api, reload]);
  return (
    <div className="auth-page">
      <div className="auth-card card stack">
        {state === "working" && <Loading />}
        {state === "done" && <div className="alert success">{t("auth.email.linked")}</div>}
        {state === "error" && <div className="alert error">{t("auth.email.invalid")}</div>}
        {state !== "working" && (
          <Link className="btn btn-primary" to="/profile">
            {t("nav.profile")}
          </Link>
        )}
      </div>
    </div>
  );
}
