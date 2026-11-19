import { NavLink, Outlet } from "react-router";
import { useMe } from "../auth/AuthContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import { Avatar } from "../ui/Avatar.js";
import { Icon } from "../ui/Icon.js";
import { Brand } from "./AthleteShell.js";
import { DemoBanner } from "./DemoBanner.js";

const navClass = ({ isActive }: { isActive: boolean }) => `nav-item${isActive ? " active" : ""}`;

/** Coach workplace: desktop-first top navigation. */
export function CoachShell() {
  const { t } = useI18n();
  const me = useMe();
  return (
    <>
      <DemoBanner />
      <header className="coach-top">
        <Brand />
        <nav aria-label={t("nav.coachView")}>
          <NavLink to="/coach" end className={navClass}>
            {t("nav.athletes")}
          </NavLink>
          <NavLink to="/coach/planner" className={navClass}>
            {t("nav.planner")}
          </NavLink>
          <NavLink to="/coach/messages" className={navClass}>
            {t("nav.messages")}
          </NavLink>
        </nav>
        <div className="row" style={{ marginLeft: "auto" }}>
          {me.user.roles.includes("athlete") && (
            <NavLink to="/" className="btn btn-secondary btn-small">
              <Icon name="swap" size={16} />
              <span className="hide-mobile">{t("nav.athleteView")}</span>
            </NavLink>
          )}
          <NavLink to="/profile" aria-label={t("nav.profile")} style={{ textDecoration: "none" }}>
            <Avatar name={me.user.displayName} />
          </NavLink>
        </div>
      </header>
      <main className="main wide">
        <Outlet />
      </main>
    </>
  );
}
