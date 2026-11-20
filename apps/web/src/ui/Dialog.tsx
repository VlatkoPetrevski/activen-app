import { useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nContext.js";
import { Icon } from "./Icon.js";

/** Modal sheet (native <dialog>: focus trap, Esc to close, inert background). */
export function Dialog({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  /** Wider sheet for tables and charts (activity stats). */
  wide?: boolean;
  onClose(): void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
    } else if (!open && el.open) {
      if (typeof el.close === "function") el.close();
      else el.removeAttribute("open");
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`sheet${wide ? " sheet-wide" : ""}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          <div className="sheet-head">
            <h2>{title}</h2>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="sheet-body">{children}</div>
        </>
      )}
    </dialog>
  );
}
