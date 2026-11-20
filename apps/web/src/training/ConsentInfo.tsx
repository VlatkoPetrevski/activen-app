import { CONSENT_SCOPES, type ConsentScope } from "@activen/contracts";
import { useState } from "react";
import { useI18n } from "../i18n/I18nContext.js";
import { Dialog } from "../ui/Dialog.js";
import { Icon } from "../ui/Icon.js";

/**
 * "i" button next to an athlete: what they share with the coach and what is missing because
 * of it. The athlete decides (ADR-0003); the coach should never wonder why data is absent.
 */
export function ConsentInfo({
  name,
  scopes,
  withLabel = false,
}: {
  name: string;
  scopes: ConsentScope[];
  /** Text next to the icon (in lists, where the icon alone is easy to miss). */
  withLabel?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const missing = CONSENT_SCOPES.filter((s) => !scopes.includes(s));
  return (
    <>
      <button
        type="button"
        className={`${withLabel ? "btn btn-secondary btn-small" : "icon-btn"} consent-btn${missing.length ? " partial" : ""}`}
        aria-label={withLabel ? undefined : t("consent.infoOf", { name })}
        title={t("consent.infoOf", { name })}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Icon name="info" size={18} />
        {withLabel && t("consent.info")}
      </button>
      <Dialog open={open} title={t("consent.infoOf", { name })} onClose={() => setOpen(false)}>
        <div className="stack">
          {missing.length === 0 && (
            <div className="alert success">{t("consent.all", { name })}</div>
          )}
          <ul className="consent-list">
            {CONSENT_SCOPES.map((s) => {
              const shared = scopes.includes(s);
              return (
                <li key={s} className={shared ? "shared" : "missing"}>
                  <Icon name={shared ? "check" : "lock"} size={16} />
                  <div>
                    <div>
                      <strong>{t(`coach.scope.${s}`)}</strong>{" "}
                      <span className="small muted">
                        · {t(shared ? "consent.shared" : "consent.notShared")}
                      </span>
                    </div>
                    {!shared && <div className="small muted">{t(`consent.missing.${s}`)}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="tiny muted">{t("consent.note")}</p>
        </div>
      </Dialog>
    </>
  );
}

/** Placeholder where data is hidden by the athlete's choice. */
export function Locked({ children }: { children: string }) {
  return (
    <div className="locked">
      <Icon name="lock" size={18} />
      <span>{children}</span>
    </div>
  );
}
