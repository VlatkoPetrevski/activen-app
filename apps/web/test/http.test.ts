import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/api.js";
import { HttpApi } from "../src/api/http.js";

type Call = { url: string; init: RequestInit };
const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function fake(responses: ((call: Call) => Response)[]) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request ${url}`);
    return next(call);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}
const headers = (c: Call) => c.init.headers as Record<string, string>;

describe("HttpApi", () => {
  it("signs in, keeps the access token in memory and sends it", async () => {
    const { fn, calls } = fake([
      () => json(200, { accessToken: "at-1", user: { id: "u" }, created: true }),
      () => json(200, { user: { id: "u" } }),
    ]);
    const api = new HttpApi("https://api.test", fn);
    expect((await api.verifyEmailSignIn("token-123")).created).toBe(true);
    await api.me();
    expect(calls[0]!.url).toBe("https://api.test/v1/auth/email/verify");
    expect(headers(calls[0]!)["X-Requested-With"]).toBe("activen");
    expect(calls[0]!.init.credentials).toBe("include");
    expect(headers(calls[1]!).Authorization).toBe("Bearer at-1");
  });

  it("refreshes once on 401 and retries, sharing the refresh between parallel calls", async () => {
    const { fn, calls } = fake([
      () => json(401, { code: "expired" }),
      () => json(401, { code: "expired" }),
      () => json(200, { accessToken: "at-2" }),
      () => json(200, []),
      () => json(200, []),
    ]);
    const api = new HttpApi("", fn);
    const [a, b] = await Promise.all([api.coaches(), api.comments()]);
    expect(a).toEqual([]);
    expect(b).toEqual([]);
    expect(calls.filter((c) => c.url.endsWith("/v1/auth/refresh"))).toHaveLength(1);
    expect(headers(calls[4]!).Authorization).toBe("Bearer at-2");
  });

  it("turns problem details into ApiError and handles 204 and network errors", async () => {
    const { fn } = fake([
      () =>
        json(409, {
          title: "Conflict",
          detail: "exists",
          code: "account_exists",
          providers: ["email"],
        }),
      () => new Response(null, { status: 204 }),
      () => {
        throw new TypeError("offline");
      },
      () => json(401, {}),
      () => json(401, {}),
    ]);
    const api = new HttpApi("", fn);
    await expect(api.signInWithIdToken("google", "id", "nonce")).rejects.toMatchObject({
      status: 409,
      code: "account_exists",
      providers: ["email"],
      message: "exists",
    });
    await expect(api.deletePlan("p")).resolves.toBeUndefined();
    await expect(api.me()).rejects.toMatchObject({ status: 0 });
    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
  });

  it("restores and ends sessions via the refresh cookie", async () => {
    const { fn, calls } = fake([
      () => json(200, { accessToken: "at-3" }),
      () => new Response(null, { status: 204 }),
      () => json(401, {}),
    ]);
    const api = new HttpApi("", fn);
    expect(await api.restoreSession()).toBe(true);
    await api.signOut();
    expect(calls[1]!.url).toBe("/v1/auth/logout");
    expect(await api.restoreSession()).toBe(false);
    expect(await api.wellness()).toBeNull();
  });

  it("builds the coach and training URLs", async () => {
    const responses = Array.from(
      { length: 30 },
      () => () => json(200, { roles: ["athlete"], revoked: 0 }),
    );
    const { fn, calls } = fake(responses);
    const api = new HttpApi("", fn);
    await api.calendar("2026-11-16", "2026-11-22");
    await api.createPlan({ calendarDate: "2026-11-20", kind: "rest", description: "x" });
    await api.updatePlan("p", { expectedVersion: 1 });
    await api.activities("2026-11-01", "2026-11-19");
    await api.activity("a");
    await api.saveFeedback("a", { perceivedEffort: 5, feel: 3, comment: null });
    await api.progress(12);
    await api.acceptCoach("l", ["activities"]);
    await api.updateCoachScopes("l", []);
    await api.endCoach("l");
    await api.postComment({ body: "hi" });
    await api.coachAthletes();
    await api.inviteAthlete("a@b.c");
    await api.athleteCalendar("x", "2026-11-16", "2026-11-22");
    await api.athleteProgress("x", 8);
    await api.createAthletePlan("x", {
      calendarDate: "2026-11-20",
      kind: "rest",
      description: "x",
    });
    await api.updateAthletePlan("x", "p", { expectedVersion: 1 });
    await api.deleteAthletePlan("x", "p");
    await api.athleteComments("x");
    await api.postAthleteComment("x", { body: "ok" });
    await api.endAthlete("x");
    await api.updateProfile("V");
    await api.updateSettings({ unitSystem: "imperial" });
    expect(await api.addRole("coach")).toEqual(["athlete"]);
    expect(await api.removeRole("coach")).toEqual(["athlete"]);
    await api.sessions();
    await api.revokeSession("s");
    expect(await api.revokeOtherSessions()).toBe(0);
    await api.unlinkIdentity("i");
    await api.startEmailLink("a@b.c", "mk");
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toMatchSnapshot();
  });

  it("builds the remaining account, analytics and workout requests", async () => {
    const { fn, calls } = fake(
      Array.from({ length: 12 }, () => () => json(200, { structure: null })),
    );
    const api = new HttpApi("https://api.activen.app", fn);
    await api.me();
    await api.verifyEmailLink("t0k3n");
    await api.deletePlan("p");
    await api.coaches();
    await api.comments();
    expect(await api.structureWorkout("6 × 1 km", "mk")).toEqual({ structure: null });
    await api.coachAnalytics();
    await api.athleteAnalytics("x");
    await api.athleteActivity("x", "a");
    await api.deleteAccount();
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      "GET https://api.activen.app/v1/me",
      "POST https://api.activen.app/v1/me/identities/email/verify",
      "DELETE https://api.activen.app/v1/me/plan/p",
      "GET https://api.activen.app/v1/me/coaches",
      "GET https://api.activen.app/v1/me/comments",
      "POST https://api.activen.app/v1/workouts/structure",
      "GET https://api.activen.app/v1/coach/analytics",
      "GET https://api.activen.app/v1/coach/athletes/x/analytics",
      "GET https://api.activen.app/v1/coach/athletes/x/activities/a",
      "DELETE https://api.activen.app/v1/me",
    ]);
    expect(JSON.parse(String(calls[5]!.init.body))).toEqual({ text: "6 × 1 km", locale: "mk" });
    expect(JSON.parse(String(calls[9]!.init.body))).toEqual({ confirm: "DELETE" });
  });
});
