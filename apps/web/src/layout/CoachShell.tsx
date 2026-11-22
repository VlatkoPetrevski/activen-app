import { useEffect, useId, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useMe } from "../auth/AuthContext.js";
import { useI18n } from "../i18n/I18nContext.js";
import { initials } from "../lib/dates.js";
import { useIsMobile } from "../lib/useIsMobile.js";
import { Avatar } from "../ui/Avatar.js";
import { Icon } from "../ui/Icon.js";
import { Brand } from "./AthleteShell.js";
import { DemoBanner } from "./DemoBanner.js";

const navClass = ({ isActive }: { isActive: boolean }) => `nav-item${isActive ? " active" : ""}`;

const SECTIONS = [
  { to: "/coach", end: true, key: "nav.athletes" },
  { to: "/coach/analytics", end: false, key: "nav.analytics" },
  { to: "/coach/planner", end: false, key: "nav.planner" },
  { to: "/coach/messages", end: false, key: "nav.messages" },
] as const;

/** The section the coach is in (an athlete's page belongs to "Athletes"). */
function useCurrentSection() {
  const { pathname } = useLocation();
  return (
    [...SECTIONS].reverse().find((s) => (s.end ? pathname === s.to : pathname.startsWith(s.to))) ??
    SECTIONS[0]
  );
}

/**
 * Phones: one button with the current section; it drops down the sections as a menu and folds
 * back up after a choice, outside tap or Escape.
 */
function SectionMenu() {
  const { t } = useI18n();
  const me = useMe();
  const id = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = useCurrentSection();
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div className="section-menu" ref={ref}>
      <button
        type="button"
        className="section-menu-button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {t(current.key)}
        <Icon name="chevronDown" size={18} />
      </button>
      <nav id={id} className="section-menu-list" aria-label={t("nav.coachView")} hidden={!open}>
        {SECTIONS.map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            end={s.end}
            className={navClass}
            onClick={() => setOpen(false)}
          >
            {t(s.key)}
          </NavLink>
        ))}
        {me.user.roles.includes("athlete") && (
          <NavLink to="/" className="nav-item" onClick={() => setOpen(false)}>
            <Icon name="swap" size={16} /> {t("nav.athleteView")}
          </NavLink>
        )}
      </nav>
    </div>
  );
}

/** Coach workplace: top navigation on desktop, a collapsing section menu on phones. */
export function CoachShell() {
  const { t } = useI18n();
  const me = useMe();
  const mobile = useIsMobile();
  return (
    <>
      <DemoBanner />
      <header className="coach-top">
        <Brand />
        {mobile ? (
          <SectionMenu />
        ) : (
          <nav aria-label={t("nav.coachView")}>
            {SECTIONS.map((s) => (
              <NavLink key={s.to} to={s.to} end={s.end} className={navClass}>
                {t(s.key)}
              </NavLink>
            ))}
          </nav>
        )}
        <div className="row" style={{ marginLeft: "auto" }}>
          {!mobile && me.user.roles.includes("athlete") && (
            <NavLink
              to="/"
              className="btn btn-secondary btn-small"
              aria-label={t("nav.athleteView")}
            >
              <Icon name="swap" size={16} />
              <span>{t("nav.athleteView")}</span>
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
      </header>
      <main className="main wide">
        <Outlet />
      </main>
    </>
  );
}
