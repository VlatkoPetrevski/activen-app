import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation, type RouteObject } from "react-router";
import { useAuth } from "../auth/AuthContext.js";
import { AthleteShell } from "../layout/AthleteShell.js";
import { ActivitiesPage } from "../pages/Activities.js";
import { ActivityPage } from "../pages/Activity.js";
import { EmailVerifyPage, LinkEmailPage } from "../pages/EmailVerify.js";
import { MyCoachPage } from "../pages/MyCoach.js";
import { NotFound } from "../pages/NotFound.js";
import { PlanPage } from "../pages/Plan.js";
import { SignInPage } from "../pages/SignIn.js";
import { TodayPage } from "../pages/Today.js";
import { WelcomePage } from "../pages/Welcome.js";
import { Loading } from "../ui/States.js";

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Loading />;
  if (status === "signedOut")
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function RequireCoach({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  if (!me?.user.roles.includes("coach")) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Coach-only accounts start in the workplace. */
function Home() {
  const { me } = useAuth();
  if (me && !me.user.roles.includes("athlete") && me.user.roles.includes("coach"))
    return <Navigate to="/coach" replace />;
  return <TodayPage />;
}

export const routes: RouteObject[] = [
  { path: "/sign-in", element: <SignInPage /> },
  { path: "/auth/email", element: <EmailVerifyPage /> },
  {
    element: (
      <RequireAuth>
        <Outlet />
      </RequireAuth>
    ),
    children: [
      { path: "/welcome", element: <WelcomePage /> },
      { path: "/auth/link-email", element: <LinkEmailPage /> },
      {
        element: <AthleteShell />,
        children: [
          { index: true, element: <Home /> },
          { path: "/plan", element: <PlanPage /> },
          { path: "/activities", element: <ActivitiesPage /> },
          { path: "/activities/:id", element: <ActivityPage /> },
          {
            path: "/activities/:id/share",
            lazy: () => import("../pages/Share.js").then((m) => ({ Component: m.SharePage })),
          },
          {
            path: "/progress",
            lazy: () => import("../pages/Progress.js").then((m) => ({ Component: m.ProgressPage })),
          },
          { path: "/my-coach", element: <MyCoachPage /> },
          {
            path: "/profile",
            lazy: () =>
              import("../pages/profile/ProfilePage.js").then((m) => ({ Component: m.ProfilePage })),
          },
        ],
      },
      {
        // The coach workplace is a separate chunk: athletes never download it.
        path: "/coach",
        lazy: () =>
          import("../layout/CoachShell.js").then((m) => ({
            Component: () => (
              <RequireCoach>
                <m.CoachShell />
              </RequireCoach>
            ),
          })),
        children: [
          {
            index: true,
            lazy: () =>
              import("../pages/coach/Dashboard.js").then((m) => ({ Component: m.CoachDashboard })),
          },
          {
            path: "athletes/:athleteId",
            lazy: () =>
              import("../pages/coach/Athlete.js").then((m) => ({ Component: m.CoachAthletePage })),
          },
          {
            path: "analytics",
            lazy: () =>
              import("../pages/coach/analytics/Overview.js").then((m) => ({
                Component: m.CoachAnalytics,
              })),
          },
          {
            path: "analytics/:athleteId",
            lazy: () =>
              import("../pages/coach/analytics/AthleteAnalytics.js").then((m) => ({
                Component: m.CoachAthleteAnalytics,
              })),
          },
          {
            path: "analytics/:athleteId/activities/:activityId",
            lazy: () =>
              import("../pages/coach/analytics/ActivityAnalytics.js").then((m) => ({
                Component: m.CoachActivityAnalytics,
              })),
          },
          {
            path: "planner",
            lazy: () =>
              import("../pages/coach/Planner.js").then((m) => ({ Component: m.CoachPlanner })),
          },
          {
            path: "messages",
            lazy: () =>
              import("../pages/coach/Messages.js").then((m) => ({ Component: m.CoachMessages })),
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFound /> },
];
