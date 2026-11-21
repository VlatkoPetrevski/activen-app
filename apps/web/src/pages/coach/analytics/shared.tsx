import type { AthleteAnalyticsDto } from "@activen/contracts";
import { Link } from "react-router";
import { ConsentInfo } from "../../../training/ConsentInfo.js";
import { Avatar } from "../../../ui/Avatar.js";
import { Icon } from "../../../ui/Icon.js";

export const pct = (done: number, planned: number) =>
  planned ? Math.round((done / planned) * 100) : null;

/** Athlete name with what they share and the way back. */
export function Header({
  data,
  back,
}: {
  data: { displayName: string; scopes: AthleteAnalyticsDto["summary"]["scopes"] };
  back: { to: string; label: string };
}) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <Link to={back.to} className="back-link">
        <Icon name="chevronLeft" size={16} /> {back.label}
      </Link>
      <div className="row">
        <Avatar name={data.displayName} />
        <h1 className="grow">{data.displayName}</h1>
        <ConsentInfo name={data.displayName} scopes={data.scopes} />
      </div>
    </div>
  );
}

/** One athlete: key numbers first, every chart one tap away. */
