import { CONSENT_SCOPES, type ConsentScope } from "@activen/contracts";
import { useI18n } from "../i18n/I18nContext.js";

/** Consent per scope (ADR-0003): the athlete decides what the coach may see. */
export function ScopePicker({
  value,
  onChange,
  disabled,
}: {
  value: ConsentScope[];
  onChange(next: ConsentScope[]): void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 0 }}>
      <legend className="small" style={{ fontWeight: 700, marginBottom: 4 }}>
        {t("coach.share")}
      </legend>
      {CONSENT_SCOPES.map((scope) => (
        <label key={scope} className="check">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.includes(scope)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, scope] : value.filter((s) => s !== scope))
            }
          />
          {t(`coach.scope.${scope}`)}
        </label>
      ))}
    </fieldset>
  );
}
