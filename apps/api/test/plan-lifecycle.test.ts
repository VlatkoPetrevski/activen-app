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
} from "./harness.js";

/** Plans edited by two people, structured workouts, check-ins and validation at the edges. */
let h: Harness;
const today = localDateOf(new Date().toISOString(), "Europe/Skopje");

beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());

const intervals = {
  source: "parser",
  items: [
    {
      kind: "step",
      intensity: "warmup",
      duration: { type: "distance", meters: 2000 },
      target: { type: "none" },
    },
    {
      kind: "repeat",
      count: 5,
      steps: [
        {
          kind: "step",
          intensity: "active",
          duration: { type: "distance", meters: 1000 },
          target: { type: "pace", low: 240, high: 250 },
        },
        {
          kind: "step",
          intensity: "recovery",
          duration: { type: "time", seconds: 90 },
          target: { type: "none" },
        },
      ],
    },
  ],
};

describe("plan entries edited by athlete and coach", () => {
  it("detects concurrent edits with the version and keeps the last good state", async () => {
    const coach = await signInCoach(h);
    const athlete = await signIn(h);
    await link(h, coach, athlete, ["activities"]);
    const created = await h
      .http()
      .post(`/v1/coach/athletes/${athlete.id}/plan`)
      .set(coach.auth)
      .send(planBody(today, { description: "5 × 1 km", structure: intervals }))
      .expect(201);
    expect(created.body.structure).toEqual(intervals);
    const id = created.body.id as string;

    // Athlete edits first (version 1 → 2).
    const mine = await h
      .http()
      .patch(`/v1/me/plan/${id}`)
      .set(athlete.auth)
      .send({ expectedVersion: 1, notes: "Moved to the evening" })
      .expect(200);
    expect(mine.body).toMatchObject({ version: 2, structure: intervals });

    // The coach still holds version 1: conflict, nothing overwritten.
    const stale = await h
      .http()
      .patch(`/v1/coach/athletes/${athlete.id}/plan/${id}`)
      .set(coach.auth)
      .send({ expectedVersion: 1, description: "6 × 1 km" });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ status: 409 });

    // With the fresh version it goes through; omitted fields keep their values.
    const fresh = await h
      .http()
      .patch(`/v1/coach/athletes/${athlete.id}/plan/${id}`)
      .set(coach.auth)
      .send({ expectedVersion: 2, description: "6 × 1 km", structure: null })
      .expect(200);
    expect(fresh.body).toMatchObject({
      version: 3,
      description: "6 × 1 km",
      notes: "Moved to the evening",
      structure: null,
    });

    // Deleted entries are gone for both.
    await h.http().delete(`/v1/me/plan/${id}`).set(athlete.auth).expect(204);
    await h
      .http()
      .patch(`/v1/coach/athletes/${athlete.id}/plan/${id}`)
      .set(coach.auth)
      .send({ expectedVersion: 3, description: "x" })
      .expect(404);
    await h.http().delete(`/v1/me/plan/${id}`).set(athlete.auth).expect(404);
  });

  it("rejects invalid plans with 422 and field details", async () => {
    const athlete = await signIn(h);
    const bad: Record<string, unknown>[] = [
      { ...planBody(today), calendarDate: "2026-13-40" },
      { ...planBody(today), kind: "nap" },
      { ...planBody(today), description: "" },
      { ...planBody(today), description: "x".repeat(501) },
      { ...planBody(today), plannedDistanceInMeters: -1 },
      { ...planBody(today), plannedDurationInSeconds: 1.5 },
      { ...planBody(today), plannedActivityType: "TELEPORT" },
      { ...planBody(today), sequence: 10 },
      { ...planBody(today), structure: { source: "parser", items: [{ kind: "step" }] } },
      { ...planBody(today), structure: { source: "magic", items: [] } },
      {
        ...planBody(today),
        structure: {
          source: "manual",
          items: [{ ...intervals.items[0], target: { type: "pace", low: 300, high: 240 } }],
        },
      },
    ];
    for (const body of bad) {
      const res = await h.http().post("/v1/me/plan").set(athlete.auth).send(body);
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(422);
      expect(res.headers["content-type"]).toContain("application/problem+json");
    }
    const ok = await h
      .http()
      .post("/v1/me/plan")
      .set(athlete.auth)
      .send(planBody(today))
      .expect(201);
    // Updates are strict: unknown keys and a missing version are refused.
    for (const body of [
      { description: "x" },
      { expectedVersion: 1, owner: "me" },
      { expectedVersion: 0 },
    ])
      await h.http().patch(`/v1/me/plan/${ok.body.id}`).set(athlete.auth).send(body).expect(422);
  });

  it("plans a rest day and several sessions on one day in order", async () => {
    const athlete = await signIn(h);
    const day = addDays(today, 3);
    await h
      .http()
      .post("/v1/me/plan")
      .set(athlete.auth)
      .send(
        planBody(day, {
          sequence: 1,
          description: "Gym",
          plannedActivityType: "STRENGTH_TRAINING",
        }),
      )
      .expect(201);
    await h
      .http()
      .post("/v1/me/plan")
      .set(athlete.auth)
      .send(planBody(day, { sequence: 0 }))
      .expect(201);
    await h
      .http()
      .post("/v1/me/plan")
      .set(athlete.auth)
      .send({ calendarDate: addDays(day, 1), kind: "rest", description: "Rest" })
      .expect(201);
    const cal = await h
      .http()
      .get(`/v1/me/calendar?from=${day}&to=${addDays(day, 1)}`)
      .set(athlete.auth)
      .expect(200);
    expect(cal.body.entries.map((e: { description: string }) => e.description)).toEqual([
      "Easy 8 km",
      "Gym",
      "Rest",
    ]);
  });
});

describe("check-ins and messages", () => {
  it("validates and overwrites the check-in, and links a plan entry to a message", async () => {
    const athlete = await signIn(h);
    const run = await addActivity(h, athlete.id, today);
    for (const body of [
      { perceivedEffort: 11, feel: 3 },
      { perceivedEffort: 0, feel: 3 },
      { perceivedEffort: 5, feel: 6 },
      { perceivedEffort: 5.5, feel: 3 },
      { perceivedEffort: 5, feel: 3, comment: "x".repeat(2001) },
    ])
      await h
        .http()
        .put(`/v1/me/activities/${run.id}/feedback`)
        .set(athlete.auth)
        .send(body)
        .expect(422);
    await h
      .http()
      .put(`/v1/me/activities/${run.id}/feedback`)
      .set(athlete.auth)
      .send({ perceivedEffort: 4, feel: 4, comment: "  fine  " })
      .expect(200);
    const second = await h
      .http()
      .put(`/v1/me/activities/${run.id}/feedback`)
      .set(athlete.auth)
      .send({ perceivedEffort: null, feel: 5, comment: "   " })
      .expect(200);
    expect(second.body).toMatchObject({ perceivedEffort: null, feel: 5, comment: null });

    const entry = await h
      .http()
      .post("/v1/me/plan")
      .set(athlete.auth)
      .send(planBody(today))
      .expect(201);
    const msg = await h
      .http()
      .post("/v1/me/comments")
      .set(athlete.auth)
      .send({ body: "  Can I swap this?  ", planEntryId: entry.body.id })
      .expect(201);
    expect(msg.body).toMatchObject({ body: "Can I swap this?", planEntryId: entry.body.id });
    for (const body of [{ body: "" }, { body: "   " }, { body: "x".repeat(4001) }])
      await h.http().post("/v1/me/comments").set(athlete.auth).send(body).expect(422);
  });

  it("orders the thread newest first and shows the author's name", async () => {
    const coach = await signInCoach(h);
    await h.http().patch("/v1/me").set(coach.auth).send({ displayName: "Ana" }).expect(200);
    const athlete = await signIn(h);
    await link(h, coach, athlete, []);
    await h.http().post("/v1/me/comments").set(athlete.auth).send({ body: "first" }).expect(201);
    await h
      .http()
      .post(`/v1/coach/athletes/${athlete.id}/comments`)
      .set(coach.auth)
      .send({ body: "second" })
      .expect(201);
    const thread = await h.http().get("/v1/me/comments").set(athlete.auth).expect(200);
    expect(thread.body.map((c: { body: string }) => c.body)).toEqual(["second", "first"]);
    expect(thread.body[0].authorName).toBe("Ana");
    const same = await h
      .http()
      .get(`/v1/coach/athletes/${athlete.id}/comments`)
      .set(coach.auth)
      .expect(200);
    expect(same.body).toEqual(thread.body);
  });
});

describe("ranges", () => {
  it("validates calendar, activity and progress ranges", async () => {
    const athlete = await signIn(h);
    for (const q of ["from=2026-02-30&to=2026-03-01", "from=x&to=y", "from=2026-01-01"])
      await h.http().get(`/v1/me/calendar?${q}`).set(athlete.auth).expect(422);
    for (const w of ["3", "53", "abc"])
      await h.http().get(`/v1/me/progress?weeks=${w}`).set(athlete.auth).expect(422);
    const ok = await h.http().get("/v1/me/progress").set(athlete.auth).expect(200);
    expect(ok.body.weeks).toHaveLength(12);
    const empty = await h
      .http()
      .get(`/v1/me/activities?from=${today}&to=${today}`)
      .set(athlete.auth)
      .expect(200);
    expect(empty.body).toEqual([]);
  });
});
