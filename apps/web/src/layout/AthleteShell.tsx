import { initials } from "../lib/dates.js";
import { NavLink, Outlet } from "react-router";
import { useMe } from "../auth/AuthContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import { Avatar } from "../ui/Avatar.js";
import { Icon, type IconName } from "../ui/Icon.js";
import { DemoBanner } from "./DemoBanner.js";

const ITEMS: {
  to: string;
  icon: IconName;
  key: "nav.today" | "nav.plan" | "nav.activities" | "nav.progress" | "nav.coach";
}[] = [
  { to: "/", icon: "today", key: "nav.today" },
  { to: "/plan", icon: "plan", key: "nav.plan" },
  { to: "/activities", icon: "activities", key: "nav.activities" },
  { to: "/progress", icon: "progress", key: "nav.progress" },
  { to: "/my-coach", icon: "coach", key: "nav.coach" },
];

const navClass = ({ isActive }: { isActive: boolean }) => `nav-item${isActive ? " active" : ""}`;

export function Brand() {
  return (
    <NavLink to="/" className="brand">
      <img src="./icon.svg" alt="" />
      ActiveN
    </NavLink>
  );
}

/** Athlete app: bottom navigation on phones, sidebar on desktop. */
export function AthleteShell() {
  const { t } = useI18n();
  const me = useMe();
  const isCoach = me.user.roles.includes("coach");
  return (
    <>
      <DemoBanner />
      <div className="shell with-side">
        <nav className="side-nav" aria-label="ActiveN">
          <Brand />
          {ITEMS.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === "/"} className={navClass}>
              <Icon name={i.icon} />
              {t(i.key)}
            </NavLink>
          ))}
          <span className="spacer" />
          {isCoach && (
            <NavLink to="/coach" className={navClass}>
              <Icon name="swap" />
              {t("nav.coachView")}
            </NavLink>
          )}
          <NavLink to="/profile" className={navClass}>
            <Icon name="profile" />
            {t("nav.profile")}
          </NavLink>
        </nav>
        <div>
          <main className="main">
            <div className="topbar">
              <Brand />
              <div className="row" style={{ marginLeft: "auto" }}>
                {isCoach && (
                  <NavLink to="/coach" className="btn btn-secondary btn-small hide-desktop">
                    <Icon name="swap" size={16} /> {t("nav.coachView")}
                  </NavLink>
                )}
                <NavLink
                  to="/profile"
                  aria-label={`${t("nav.profile")} ${initials(me.user.displayName)}`}
                  style={{ textDecoration: "none" }}
                >
                  <Avatar name={me.user.displayName} />
                </NavLink>
              </div>
            </div>
            <Outlet />
          </main>
        </div>
        <nav className="bottom-nav" aria-label="ActiveN">
          {ITEMS.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === "/"} className={navClass}>
              <Icon name={i.icon} />
              {t(i.key)}
            </NavLink>
          ))}
        </nav>
      </div>
    </>
  );
}
