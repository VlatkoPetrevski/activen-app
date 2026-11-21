import type { ConsentScope } from "@activen/db";
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
 * The athlete decides what the coach sees (ADR-0003). Every scope combination is checked on
 * every coach read, and changes to consent take effect on the very next request.
 */
let h: Harness;
const today = localDateOf(new Date().toISOString(), "Europe/Skopje");
const day = addDays(today, -1);

beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());

async function setup(scopes: ConsentScope[]) {
  const coach = await signInCoach(h);
  const athlete = await signIn(h);
  const linkId = await link(h, coach, athlete, scopes);
  const garmin = await addActivity(h, athlete.id, day);
  const strava = await addActivity(h, athlete.id, day, {
    vendor: "strava",
    activityName: "Strava ride",
    activityType: "CYCLING",
  });
  await h
    .http()
    .put(`/v1/me/activities/${garmin.id}/feedback`)
    .set(athlete.auth)
    .send({ perceivedEffort: 7, feel: 2, comment: "Left knee hurt" })
    .expect(200);
  await h
    .http()
    .post("/v1/me/comments")
    .set(athlete.auth)
    .send({ body: "About this run", activityId: garmin.id })
    .expect(201);
  return { coach, athlete, linkId, garmin, strava };
}

const calendar = (coach: TestUser, athleteId: string) =>
  h.http().get(`/v1/coach/athletes/${athleteId}/calendar?from=${day}&to=${today}`).set(coach.auth);

const MATRIX: ConsentScope[][] = [
  [],
  ["activities"],
  ["comments"],
  ["activities", "comments"],
  ["activities", "comments", "location", "sleep_recovery"],
];

describe.each(MATRIX)("with consent %j", (...scopes) => {
  it("shows exactly what was shared", async () => {
    const { coach, athlete, garmin, strava } = await setup(scopes);
    const shares = (s: ConsentScope) => scopes.includes(s);

    // Calendar: plan always; activities only with consent; never Strava.
    const cal = await calendar(coach, athlete.id).expect(200);
    expect(cal.body.activitiesVisible).toBe(shares("activities"));
    const ids = (cal.body.activities as { id: string }[]).map((a) => a.id);
    expect(ids).not.toContain(strava.id);
    expect(ids.includes(garmin.id)).toBe(shares("activities"));
    if (shares("activities")) {
      const fb = (
        cal.body.activities as { id: string; feedback: { comment: string | null } }[]
      ).find((a) => a.id === garmin.id)!.feedback;
      // Ratings travel with the activity; the written comment only with "comments".
      expect(fb).toMatchObject({ perceivedEffort: 7, feel: 2 });
      expect(fb.comment).toBe(shares("comments") ? "Left knee hurt" : null);
    }

    // Activity detail.
    const detail = await h
      .http()
      .get(`/v1/coach/athletes/${athlete.id}/activities/${garmin.id}`)
      .set(coach.auth);
    if (!shares("activities")) expect(detail.status).toBe(403);
    else {
      expect(detail.status).toBe(200);
      expect(detail.body.comments.length > 0).toBe(shares("comments"));
      expect(detail.body.activity.feedback.comment).toBe(
        shares("comments") ? "Left knee hurt" : null,
      );
    }
    // Strava activities are hidden as if missing (consent cannot override vendor terms).
    const viaStrava = await h
      .http()
      .get(`/v1/coach/athletes/${athlete.id}/activities/${strava.id}`)
      .set(coach.auth);
    expect(viaStrava.status).toBe(shares("activities") ? 404 : 403);

    // Progress.
    const progress = await h
      .http()
      .get(`/v1/coach/athletes/${athlete.id}/progress?weeks=4`)
      .set(coach.auth);
    expect(progress.status).toBe(shares("activities") ? 200 : 403);

    // Analytics: always answers, with data only as shared.
    const analytics = await h
      .http()
      .get(`/v1/coach/athletes/${athlete.id}/analytics`)
      .set(coach.auth)
      .expect(200);
    expect(analytics.body.summary.scopes).toEqual([...scopes].sort());
    expect(JSON.stringify(analytics.body)).not.toContain("Strava ride");
    if (!shares("comments")) expect(JSON.stringify(analytics.body)).not.toContain("Left knee");

    // Dashboard row reports the scopes.
    const rows = await h.http().get("/v1/coach/athletes").set(coach.auth).expect(200);
    expect(rows.body[0]).toMatchObject({ athleteId: athlete.id, scopes: [...scopes].sort() });
    expect(JSON.stringify(rows.body)).not.toContain("Strava ride");

    // Commenting on an activity needs the same visibility as reading it.
    const reply = await h
      .http()
      .post(`/v1/coach/athletes/${athlete.id}/comments`)
      .set(coach.auth)
      .send({ body: "Ice it", activityId: garmin.id });
    expect(reply.status).toBe(shares("activities") ? 201 : 404);
    await h
      .http()
      .post(`/v1/coach/athletes/${athlete.id}/comments`)
      .set(coach.auth)
      .send({ body: "Nice", activityId: strava.id })
      .expect(404);
  });
});

describe("consent changes", () => {
  it("take effect on the next request, and each shared read is audited", async () => {
    const { coach, athlete, linkId, garmin } = await setup(["activities"]);
    await calendar(coach, athlete.id).expect(200);

    await h
      .http()
      .put(`/v1/me/coaches/${linkId}/scopes`)
      .set(athlete.auth)
      .send({ scopes: ["comments"] })
      .expect(204);
    const after = await calendar(coach, athlete.id).expect(200);
    expect(after.body.activitiesVisible).toBe(false);
    expect(after.body.activities).toEqual([]);
    await h
      .http()
      .get(`/v1/coach/athletes/${athlete.id}/activities/${garmin.id}`)
      .set(coach.auth)
      .expect(403);

    // Granting back works and the athlete sees the current scopes.
    await h
      .http()
      .put(`/v1/me/coaches/${linkId}/scopes`)
      .set(athlete.auth)
      .send({ scopes: ["activities", "comments", "activities"] })
      .expect(204);
    const coaches = await h.http().get("/v1/me/coaches").set(athlete.auth).expect(200);
    expect(coaches.body[0].scopes).toEqual(["activities", "comments"]);
    const back = await calendar(coach, athlete.id).expect(200);
    expect(back.body.activities.map((a: { id: string }) => a.id)).toContain(garmin.id);

    // Unknown scopes are rejected.
    await h
      .http()
      .put(`/v1/me/coaches/${linkId}/scopes`)
      .set(athlete.auth)
      .send({ scopes: ["everything"] })
      .expect(422);

    // Ending the relationship removes access immediately, for either side.
    await h.http().delete(`/v1/me/coaches/${linkId}`).set(athlete.auth).expect(204);
    await calendar(coach, athlete.id).expect(404);
    expect((await h.http().get("/v1/coach/athletes").set(coach.auth)).body).toEqual([]);
  });

  it("plans stay editable by the coach without any data consent", async () => {
    const coach = await signInCoach(h);
    const athlete = await signIn(h);
    await link(h, coach, athlete, []);
    const created = await h
      .http()
      .post(`/v1/coach/athletes/${athlete.id}/plan`)
      .set(coach.auth)
      .send(planBody(today, { notes: "Keep it easy" }))
      .expect(201);
    expect(created.body).toMatchObject({ notes: "Keep it easy", version: 1 });
    const mine = await h
      .http()
      .get(`/v1/me/calendar?from=${today}&to=${today}`)
      .set(athlete.auth)
      .expect(200);
    expect(mine.body.entries.map((e: { id: string }) => e.id)).toContain(created.body.id);
  });
});
