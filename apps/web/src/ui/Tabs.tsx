import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface Tab {
  key: string;
  title: string;
  content: ReactNode;
}

/**
 * Accessible tabs (WAI-ARIA tabs pattern): arrow keys move between tabs, only the chosen panel is
 * rendered. Used where a phone shows one part of a page at a time.
 */
export function Tabs({
  tabs,
  label,
  initial,
}: {
  tabs: readonly Tab[];
  label: string;
  initial?: string;
}) {
  const id = useId();
  const [active, setActive] = useState(initial ?? tabs[0]?.key ?? "");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = tabs.find((x) => x.key === active) ?? tabs[0];

  const onKey = (e: KeyboardEvent, i: number) => {
    const next =
      e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : null;
    if (next === null && e.key !== "End") return;
    e.preventDefault();
    const j = e.key === "End" ? tabs.length - 1 : ((next ?? 0) + tabs.length) % tabs.length;
    const tab = tabs[j];
    if (tab) {
      setActive(tab.key);
      refs.current[j]?.focus();
    }
  };

  return (
    <div className="tabs">
      <div className="tab-list" role="tablist" aria-label={label}>
        {tabs.map((tab, i) => (
          <button
            key={tab.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${tab.key}`}
            aria-selected={tab.key === current?.key}
            aria-controls={`${id}-panel`}
            tabIndex={tab.key === current?.key ? 0 : -1}
            onClick={() => setActive(tab.key)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {tab.title}
          </button>
        ))}
      </div>
      {current && (
        <div
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-tab-${current.key}`}
          className="stack-l tab-panel"
        >
          {current.content}
        </div>
      )}
    </div>
  );
}
