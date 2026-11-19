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
}: {
  summary: ReactNode;
  /** Accessible name of the toggle. */
  label: string;
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
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
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
