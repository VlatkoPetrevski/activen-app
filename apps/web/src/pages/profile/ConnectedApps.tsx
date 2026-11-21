import type { ConnectionDto } from "@activen/contracts";
import type { MessageKey } from "@activen/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useApi } from "../../api/ApiContext.js";
import { useI18n } from "../../i18n/I18nContext.js";
import { vendorName } from "../../lib/vendors.js";
import { useConfirm } from "../../ui/Confirm.js";
import { Icon } from "../../ui/Icon.js";

/** Outcomes of the Polar Flow approval, as the API sends the browser back (`?polar=`). */
export const POLAR_RESULTS = [
  "connected",
  "denied",
  "expired",
  "taken",
  "consents",
  "error",
] as const;
export type PolarResult = (typeof POLAR_RESULTS)[number];

export const isPolarResult = (v: string | null): v is PolarResult =>
  POLAR_RESULTS.includes(v as PolarResult);

function relative(
  t: ReturnType<typeof useI18n>["t"],
  f: ReturnType<typeof useI18n>["f"],
  iso: string,
) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return t("sources.justNow");
  if (minutes < 60) return t("sources.minutesAgo", { count: minutes });
  return f.date(iso.slice(0, 10), "long");
}

function AppRow({ connection }: { connection: ConnectionDto }) {
  const api = useApi();
  const { t, f } = useI18n();
  const ask = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const name = vendorName(connection.vendor);

  const act = async (kind: "connect" | "sync" | "disconnect", fn: () => Promise<void>) => {
    setBusy(kind);
    setMessage(null);
    try {
      await fn();
    } catch {
      setMessage({ kind: "error", text: t(`sources.${kind}Error`, { app: name }) });
    } finally {
      setBusy(null);
    }
  };
  const connect = () =>
    act("connect", async () => {
      const { authorizeUrl } = await api.connectPolar();
      // Polar Flow asks the athlete, then sends the browser back to the profile.
      if (authorizeUrl.startsWith("/")) {
        await queryClient.invalidateQueries({ queryKey: ["me", "connections"] });
        navigate(authorizeUrl);
      } else window.location.assign(authorizeUrl);
    });
  const sync = () =>
    act("sync", async () => {
      const { stored } = await api.syncPolar();
      setMessage({ kind: "ok", text: t("sources.syncDone", { count: stored }) });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    });
  const disconnect = async () => {
    if (
      !(await ask(t("sources.disconnectConfirm", { app: name }), {
        confirmLabel: t("sources.disconnect"),
        danger: true,
      }))
    )
      return;
    await act("disconnect", async () => {
      await api.disconnectPolar();
      setMessage({ kind: "ok", text: t("sources.disconnected", { app: name }) });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    });
  };

  const status = !connection.available
    ? t("sources.soon")
    : !connection.connected
      ? t("sources.notConnected")
      : connection.status === "error"
        ? t("sources.lastFailed")
        : connection.lastSyncAt
          ? t("sources.connectedSynced", { when: relative(t, f, connection.lastSyncAt) })
          : t("sources.connected");

  return (
    <li className="stack" style={{ gap: 6 }}>
      <div className="list-item">
        <span
          className={`conn-dot ${connection.connected ? (connection.status === "error" ? "warn" : "good") : "off"}`}
          aria-hidden="true"
        />
        <span className="grow">
          <strong>{name}</strong>
          <span className="small muted"> · {status}</span>
        </span>
        {connection.available && !connection.connected && (
          <button
            type="button"
            className="btn btn-primary btn-small"
            disabled={busy !== null}
            onClick={() => void connect()}
          >
            <Icon name="link" size={16} /> {t("sources.connect")}
          </button>
        )}
        {connection.connected && (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              disabled={busy !== null}
              onClick={() => void sync()}
            >
              {busy === "sync" ? t("sources.syncing") : t("sources.sync")}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              disabled={busy !== null}
              onClick={() => void disconnect()}
            >
              {t("sources.disconnect")}
            </button>
          </>
        )}
      </div>
      {message && (
        <div
          className={`alert ${message.kind === "ok" ? "success" : "error"}`}
          role={message.kind === "ok" ? "status" : "alert"}
        >
          {message.text}
        </div>
      )}
    </li>
  );
}

/** Connected apps: the best source, workouts arrive by themselves after the watch syncs. */
export function ConnectedApps({ result }: { result: PolarResult | null }) {
  const api = useApi();
  const { t } = useI18n();
  const query = useQuery({ queryKey: ["me", "connections"], queryFn: () => api.connections() });
  return (
    <div className="stack" style={{ gap: 6 }}>
      <h3 className="sub-label">{t("sources.apps")}</h3>
      {result && (
        <div
          className={`alert ${result === "connected" ? "success" : "error"}`}
          role={result === "connected" ? "status" : "alert"}
        >
          {t(`sources.result.${result}` as MessageKey)}
        </div>
      )}
      <ul className="list" style={{ padding: 0, margin: 0, listStyle: "none" }}>
        {(query.data ?? []).map((c) => (
          <AppRow key={c.vendor} connection={c} />
        ))}
      </ul>
      <p className="small muted">{t("sources.appsHint")}</p>
    </div>
  );
}
