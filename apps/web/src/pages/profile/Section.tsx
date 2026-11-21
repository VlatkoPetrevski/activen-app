import type { ReactNode } from "react";
import { Segment } from "../../ui/Segment.js";

/** A profile section: title and the current value collapsed, the form on expand. */
export function Section({
  title,
  info,
  children,
  defaultOpen = false,
}: {
  title: string;
  /** Current value shown while collapsed. */
  info?: string | undefined;
  children: ReactNode;
  /** Open on arrival (e.g. back from connecting an app). */
  defaultOpen?: boolean;
}) {
  return (
    <Segment
      label={title}
      defaultOpen={defaultOpen}
      summary={
        <span className="seg-line">
          <strong>{title}</strong>
          {info && <span className="small muted">{info}</span>}
        </span>
      }
    >
      <div className="stack">{children}</div>
    </Segment>
  );
}
