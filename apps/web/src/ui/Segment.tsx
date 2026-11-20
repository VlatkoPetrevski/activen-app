import { useId, useState, type ReactNode } from "react";
import { Icon } from "./Icon.js";

/**
 * A compact row that expands in place to show details; the same click collapses it. Collapsed
 * details are inert (not focusable, hidden from screen readers).
 */
export function Segment({
  summary,
  label,
  children,
  defaultOpen = false,
  srTitle,
}: {
  summary: ReactNode;
  /** Name of the details region (the toggle is named by what it shows). */
  label: string;
  /** Read first by screen readers when the summary is only icons and numbers. */
  srTitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className={`segment${open ? " open" : ""}`}>
      <button
        type="button"
        className="segment-head"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {srTitle && <span className="sr-only">{srTitle} </span>}
        <span className="segment-summary">{summary}</span>
        <span className="segment-chevron" aria-hidden>
          <Icon name="chevronDown" size={20} />
        </span>
      </button>
      <div className="segment-body" id={id} role="region" aria-label={label} inert={!open}>
        <div className="segment-inner">
          <div className="segment-content">{children}</div>
        </div>
      </div>
    </section>
  );
}
