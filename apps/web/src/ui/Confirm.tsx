import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nContext.js";
import { Dialog } from "./Dialog.js";

type Ask = (
  message: string,
  options?: { confirmLabel?: string; danger?: boolean },
) => Promise<boolean>;

const Ctx = createContext<Ask | null>(null);

/** In-app confirmation (window.confirm is blocked in embedded views and looks foreign). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [state, setState] = useState<{
    message: string;
    confirmLabel: string;
    danger: boolean;
  } | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const ask = useCallback<Ask>(
    (message, options = {}) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setState({
          message,
          confirmLabel: options.confirmLabel ?? t("common.delete"),
          danger: options.danger ?? true,
        });
      }),
    [t],
  );
  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setState(null);
  };
  return (
    <Ctx.Provider value={ask}>
      {children}
      <Dialog open={state !== null} title={state?.message ?? ""} onClose={() => close(false)}>
        <div className="sheet-actions">
          <button type="button" className="btn btn-secondary" onClick={() => close(false)}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className={`btn ${state?.danger ? "btn-danger" : "btn-primary"}`}
            onClick={() => close(true)}
          >
            {state?.confirmLabel}
          </button>
        </div>
      </Dialog>
    </Ctx.Provider>
  );
}

export function useConfirm(): Ask {
  const ask = useContext(Ctx);
  if (!ask) throw new Error("useConfirm outside ConfirmProvider");
  return ask;
}
