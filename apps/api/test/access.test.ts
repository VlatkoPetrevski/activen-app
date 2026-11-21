import { addDays, localDateOf } from "@activen/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addActivity,
  link,
  planBody,
  signIn,
  signInCoach,
  startHarness,
  type Harness,
  type TestUser,
} from "./harness.js";

/**
 * Authorization matrix: who may call what. Each coach route is tried by an anonymous caller,
 * a signed-in user without the coach role, a coach with no link, a coach whose invitation is
 * still pending, and a coach whose relationship has ended. Ids of other people's data must
 * answer exactly like missing ids (no probing).
 */
let h: Harness;
const today = localDateOf(new Date().toISOString(), "Europe/Skopje");
const ZERO = "00000000-0000-4000-8000-000000000000";

beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());

type Method = "get" | "post" | "patch" | "delete";
interface Route {
  method: Method;
  path: (athleteId: string, ids: { plan: string; activity: string }) => string;
  body?: Record<string, unknown>;
}

const coachRoutes: Route[] = [
  { method: "get", path: (a) => `/v1/coach/athletes/${a}/calendar?from=${today}&to=${today}` },
  { method: "get", path: (a, i) => `/v1/coach/athletes/${a}/activities/${i.activity}` },
  { method: "get", path: (a) => `/v1/coach/athletes/${a}/progress?weeks=4` },
  { method: "get", path: (a) => `/v1/coach/athletes/${a}/analytics` },
  { method: "post", path: (a) => `/v1/coach/athletes/${a}/plan`, body: planBody(today) },
  {
    method: "patch",
    path: (a, i) => `/v1/coach/athletes/${a}/plan/${i.plan}`,
    body: { expectedVersion: 1, description: "x" },
  },
  { method: "delete", path: (a, i) => `/v1/coach/athletes/${a}/plan/${i.plan}` },
  { method: "get", path: (a) => `/v1/coach/athletes/${a}/comments` },
  { method: "post", path: (a) => `/v1/coach/athletes/${a}/comments`, body: { body: "Hi" } },
];

const call = (
  r: Route,
  user: TestUser | null,
  athleteId: string,
  ids: { plan: string; activity: string },
) => {
  let req = h.http()[r.method](r.path(athleteId, ids));
  if (user) req = req.set(user.auth);
  return r.body ? req.send(r.body) : req;
};

async function athleteWithData() {
  const athlete = await signIn(h);
  const plan = await h
    .http()
    .post("/v1/me/plan")
    .set(athlete.auth)
    .send(planBody(today))
    .expect(201);
  const activity = await addActivity(h, athlete.id, addDays(today, -1));
  return { athlete, ids: { plan: plan.body.id as string, activity: activity.id } };
}

describe("coach routes", () => {
  it("require a token (401) and the coach role (403)", async () => {
    const { athlete, ids } = await athleteWithData();
    const plain = await signIn(h);
    for (const r of coachRoutes) {
      await call(r, null, athlete.id, ids).expect(401);
      await call(r, plain, athlete.id, ids).expect(403);
    }
    await h.http().get("/v1/coach/athletes").expect(401);
    await h.http().get("/v1/coach/analytics").set(plain.auth).expect(403);
  });

  it("answer 404 without an active link: none, pending invitation, or ended", async () => {
    const { athlete, ids } = await athleteWithData();
    const stranger = await signInCoach(h);
    const pending = await signInCoach(h);
    await link(h, pending, athlete, "invite-only");
    const former = await signInCoach(h);
    await link(h, former, athlete, ["activities", "comments"]);
    await h.http().delete(`/v1/coach/athletes/${athlete.id}`).set(former.auth).expect(204);

    for (const coach of [stranger, pending, former])
      for (const r of coachRoutes) {
        const res = await call(r, coach, athlete.id, ids);
        expect(res.status, `${r.method} ${r.path(athlete.id, ids)}`).toBe(404);
        expect(res.body).toMatchObject({ status: 404 });
      }
    // Analytics overview lists only active athletes.
    const overview = await h.http().get("/v1/coach/analytics").set(former.auth).expect(200);
    expect(overview.body).toEqual([]);
  });

  it("reject malformed ids with 422 before touching data", async () => {
    const coach = await signInCoach(h);
    for (const path of [
      "/v1/coach/athletes/not-a-uuid/calendar?from=2026-01-01&to=2026-01-02",
      "/v1/coach/athletes/not-a-uuid/analytics",
      `/v1/coach/athletes/${ZERO}/activities/nope`,
    ]) {
      const res = await h.http().get(path).set(coach.auth);
      expect([400, 422]).toContain(res.status);
    }
  });

  it("never reach another athlete's plan entries through an active link", async () => {
    const coach = await signInCoach(h);
    const mine = await signIn(h);
    await link(h, coach, mine, ["activities"]);
    const other = await athleteWithData();
    await h
      .http()
      .patch(`/v1/coach/athletes/${mine.id}/plan/${other.ids.plan}`)
      .set(coach.auth)
      .send({ expectedVersion: 1, description: "hijack" })
      .expect(404);
    await h
      .http()
      .delete(`/v1/coach/athletes/${mine.id}/plan/${other.ids.plan}`)
      .set(coach.auth)
      .expect(404);
    await h
      .http()
      .get(`/v1/coach/athletes/${mine.id}/activities/${other.ids.activity}`)
      .set(coach.auth)
      .expect(404);
    await h
      .http()
      .post(`/v1/coach/athletes/${mine.id}/comments`)
      .set(coach.auth)
      .send({ body: "x", planEntryId: other.ids.plan })
      .expect(404);
    await h
      .http()
      .post(`/v1/coach/athletes/${mine.id}/comments`)
      .set(coach.auth)
      .send({ body: "x", activityId: other.ids.activity })
      .expect(404);
    // Untouched.
    const entry = await h.repos.plans.get(other.ids.plan);
    expect(entry.description).toBe("Easy 8 km");
  });

  it("ending a relationship twice or for a stranger answers 404", async () => {
    const coach = await signInCoach(h);
    const athlete = await signIn(h);
    await link(h, coach, athlete, []);
    await h.http().delete(`/v1/coach/athletes/${athlete.id}`).set(coach.auth).expect(204);
    await h.http().delete(`/v1/coach/athletes/${athlete.id}`).set(coach.auth).expect(404);
  });
});

describe("athlete routes", () => {
  it("never touch another athlete's plan, activities or check-ins", async () => {
    const me = await signIn(h);
    const other = await athleteWithData();
    await h
      .http()
      .patch(`/v1/me/plan/${other.ids.plan}`)
      .set(me.auth)
      .send({ expectedVersion: 1, description: "hijack" })
      .expect(404);
    await h.http().delete(`/v1/me/plan/${other.ids.plan}`).set(me.auth).expect(404);
    await h.http().get(`/v1/me/activities/${other.ids.activity}`).set(me.auth).expect(404);
    await h
      .http()
      .put(`/v1/me/activities/${other.ids.activity}/feedback`)
      .set(me.auth)
      .send({ perceivedEffort: 5, feel: 3 })
      .expect(404);
    await h
      .http()
      .post("/v1/me/comments")
      .set(me.auth)
      .send({ body: "x", activityId: other.ids.activity })
      .expect(404);
    await h
      .http()
      .post("/v1/me/comments")
      .set(me.auth)
      .send({ body: "x", planEntryId: other.ids.plan })
      .expect(404);
    expect((await h.repos.plans.get(other.ids.plan)).description).toBe("Easy 8 km");
  });

  it("cannot accept, change or end someone else's coach link", async () => {
    const coach = await signInCoach(h);
    const athlete = await signIn(h);
    const intruder = await signIn(h);
    const linkId = await link(h, coach, athlete, "invite-only");
    await h
      .http()
      .post(`/v1/me/coaches/${linkId}/accept`)
      .set(intruder.auth)
      .send({ scopes: ["activities"] })
      .expect(404);
    await h
      .http()
      .put(`/v1/me/coaches/${linkId}/scopes`)
      .set(intruder.auth)
      .send({ scopes: [] })
      .expect(404);
    await h.http().delete(`/v1/me/coaches/${linkId}`).set(intruder.auth).expect(404);
    await h.http().delete(`/v1/me/coaches/${ZERO}`).set(athlete.auth).expect(404);
    // Scopes can only change on an active link.
    await h
      .http()
      .put(`/v1/me/coaches/${linkId}/scopes`)
      .set(athlete.auth)
      .send({ scopes: ["activities"] })
      .expect(404);
    // Accepting twice fails the second time.
    await h
      .http()
      .post(`/v1/me/coaches/${linkId}/accept`)
      .set(athlete.auth)
      .send({ scopes: [] })
      .expect(204);
    await h
      .http()
      .post(`/v1/me/coaches/${linkId}/accept`)
      .set(athlete.auth)
      .send({ scopes: [] })
      .expect(404);
  });

  it("an athlete can be invited again after the relationship ended", async () => {
    const coach = await signInCoach(h);
    const athlete = await signIn(h);
    const first = await link(h, coach, athlete, ["comments"]);
    await h.http().delete(`/v1/me/coaches/${first}`).set(athlete.auth).expect(204);
    const second = await link(h, coach, athlete, ["activities"]);
    expect(second).not.toBe(first);
    const rows = await h.http().get("/v1/coach/athletes").set(coach.auth).expect(200);
    expect(rows.body).toEqual([
      expect.objectContaining({ athleteId: athlete.id, status: "active", scopes: ["activities"] }),
    ]);
    // Inviting an already linked athlete again changes nothing.
    await h
      .http()
      .post("/v1/coach/invites")
      .set(coach.auth)
      .send({ email: athlete.email })
      .expect(202);
    expect((await h.http().get("/v1/me/coaches").set(athlete.auth)).body).toHaveLength(1);
  });
});
