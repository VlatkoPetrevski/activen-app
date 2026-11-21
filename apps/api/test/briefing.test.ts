import type { Database } from "@activen/db";
import { addDays, localDateOf } from "@activen/domain";
import { DATABASE } from "../src/tokens.js";
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

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());

const today = () => localDateOf(new Date().toISOString(), "Europe/Skopje");

/** Two weeks of ordinary mornings from a watch, and steady training. */
async function history(athlete: TestUser) {
  for (let i = 1; i <= 14; i++)
    await h.repos.wellness.put(athlete.id, {
      calendarDate: addDays(today(), -i),
      source: "polar",
      sleepDurationInSeconds: 7.5 * 3600,
      sleepScore: null,
      restingHeartRate: 48 + (i % 3),
      lastNightHrvMs: 60 + (i % 4),
      vendorReadiness: null,
    });
  for (let i = 0; i < 12; i++) await addActivity(h, athlete.id, addDays(today(), -1 - i * 2));
}

const intervals = () =>
  planBody(today(), {
    description: "Интервали",
    plannedDistanceInMeters: 12_000,
    structure: {
      source: "manual",
      items: [
        {
          kind: "step",
          intensity: "warmup",
          duration: { type: "distance", meters: 2000 },
          target: { type: "none" },
        },
        {
          kind: "repeat",
          count: 6,
          steps: [
            {
              kind: "step",
              intensity: "active",
              duration: { type: "distance", meters: 1000 },
              target: { type: "pace", low: 235, high: 245 },
            },
            {
              kind: "step",
              intensity: "recovery",
              duration: { type: "time", seconds: 120 },
              target: { type: "none" },
            },
          ],
        },
      ],
    },
  });

describe("morning briefing", () => {
  it("without any data: no score, the plan stands", async () => {
    const athlete = await signIn(h);
    const res = await h.http().get("/v1/me/briefing").set(athlete.auth).expect(200);
    expect(res.body).toMatchObject({
      athleteId: athlete.id,
      calendarDate: today(),
      readiness: { score: null, confidence: "none" },
      advice: { verdict: "as_planned", reason: { kind: "no_data" } },
      planEntry: null,
      today: null,
      morningInput: null,
    });
  });

  it("the athlete types sleep and pulse; a short night turns intervals into an easy run", async () => {
    const athlete = await signIn(h);
    await history(athlete);
    await h.http().post("/v1/me/plan").set(athlete.auth).send(intervals()).expect(201);

    const good = await h
      .http()
      .put(`/v1/me/wellness/${today()}`)
      .set(athlete.auth)
      .send({ sleepDurationInSeconds: 8 * 3600, restingHeartRate: 48 })
      .expect(200);
    expect(good.body.advice.verdict).toBe("as_planned");
    expect(good.body.readiness).toMatchObject({ confidence: "high" });

    const bad = await h
      .http()
      .put(`/v1/me/wellness/${today()}`)
      .set(athlete.auth)
      .send({ sleepDurationInSeconds: 4.5 * 3600, restingHeartRate: 56 })
      .expect(200);
    expect(bad.body).toMatchObject({
      morningInput: { sleepDurationInSeconds: 16_200, restingHeartRate: 56 },
      today: { sources: { sleepDurationInSeconds: "manual", restingHeartRate: "manual" } },
      readiness: { level: "LOW" },
      advice: {
        verdict: "swap_easy",
        intensity: "hard",
        needsAttention: true,
        change: { type: "easy_instead", zone: 2 },
      },
    });
    expect(bad.body.planEntry.description).toBe("Интервали");
    // Same answer on a plain read.
    const read = await h.http().get("/v1/me/briefing").set(athlete.auth).expect(200);
    expect(read.body.advice).toEqual(bad.body.advice);

    // Clearing the input.
    const cleared = await h
      .http()
      .put(`/v1/me/wellness/${today()}`)
      .set(athlete.auth)
      .send({ sleepDurationInSeconds: null, restingHeartRate: null })
      .expect(200);
    expect(cleared.body.morningInput).toBeNull();
  });

  it("validates the morning input", async () => {
    const athlete = await signIn(h);
    const put = (date: string, body: object) =>
      h.http().put(`/v1/me/wellness/${date}`).set(athlete.auth).send(body);
    const ok = { sleepDurationInSeconds: 25_000, restingHeartRate: 50 };
    await put(addDays(today(), 1), ok).expect(422);
    await put(addDays(today(), -8), ok).expect(422);
    await put(addDays(today(), -7), ok).expect(200);
    await put("21-11-2026", ok).expect(400);
    await put(today(), { ...ok, restingHeartRate: 10 }).expect(422);
    await put(today(), { ...ok, mood: 3 }).expect(422);
    await put(today(), { sleepDurationInSeconds: 20 * 3600, restingHeartRate: null }).expect(422);
    await h.http().get("/v1/me/briefing?date=tomorrow").set(athlete.auth).expect(422);
    const past = await h
      .http()
      .get(`/v1/me/briefing?date=${addDays(today(), -7)}`)
      .set(athlete.auth)
      .expect(200);
    expect(past.body.morningInput).toEqual(ok);
    await h.http().get("/v1/me/briefing").expect(401);
  });

  it("the reminder and sleep need are profile settings", async () => {
    const athlete = await signIn(h);
    const me = await h.http().get("/v1/me").set(athlete.auth).expect(200);
    expect(me.body.settings).toMatchObject({
      sleepNeedMinutes: 480,
      briefingReminder: { enabled: false, time: "07:00" },
    });
    const saved = await h
      .http()
      .patch("/v1/me/settings")
      .set(athlete.auth)
      .send({ briefingReminder: { enabled: true, time: "06:15" }, sleepNeedMinutes: 450 })
      .expect(200);
    expect(saved.body).toMatchObject({
      sleepNeedMinutes: 450,
      briefingReminder: { enabled: true, time: "06:15" },
    });
    await h
      .http()
      .patch("/v1/me/settings")
      .set(athlete.auth)
      .send({ briefingReminder: { enabled: true, time: "6:15" } })
      .expect(422);
  });
});

describe("the coach and the briefing", () => {
  it("needs the sleep_recovery consent; low readiness before a hard session is a signal", async () => {
    const coach = await signInCoach(h);
    const athlete = await signIn(h);
    await history(athlete);
    await h.http().post("/v1/me/plan").set(athlete.auth).send(intervals()).expect(201);
    await h
      .http()
      .put(`/v1/me/wellness/${today()}`)
      .set(athlete.auth)
      .send({ sleepDurationInSeconds: 4 * 3600, restingHeartRate: 57 })
      .expect(200);

    const linkId = await link(h, coach, athlete, ["comments"]);
    await h.http().get(`/v1/coach/athletes/${athlete.id}/briefing`).set(coach.auth).expect(403);
    const rowsBefore = await h.http().get("/v1/coach/athletes").set(coach.auth).expect(200);
    expect(rowsBefore.body[0].signals).toEqual([]);
    const hidden = await h
      .http()
      .get(`/v1/coach/athletes/${athlete.id}/analytics`)
      .set(coach.auth)
      .expect(200);
    expect(hidden.body.wellness).toBeNull();

    await h
      .http()
      .put(`/v1/me/coaches/${linkId}/scopes`)
      .set(athlete.auth)
      .send({ scopes: ["sleep_recovery"] })
      .expect(204);
    const b = await h
      .http()
      .get(`/v1/coach/athletes/${athlete.id}/briefing`)
      .set(coach.auth)
      .expect(200);
    expect(b.body.advice).toMatchObject({ verdict: "rest", needsAttention: true });
    // Without "activities", the coach sees that load counted, not the ratio.
    const load = (
      b.body.readiness.factors as { key: string; value: unknown; score: unknown }[]
    ).find((f) => f.key === "load");
    expect(load).toMatchObject({ value: null });
    expect(load?.score).not.toBeNull();

    const rows = await h.http().get("/v1/coach/athletes").set(coach.auth).expect(200);
    expect(rows.body[0].signals).toEqual([
      { code: "low_readiness", score: b.body.readiness.score, calendarDate: today() },
    ]);
    const analytics = await h
      .http()
      .get(`/v1/coach/athletes/${athlete.id}/analytics`)
      .set(coach.auth)
      .expect(200);
    expect(analytics.body.wellness).toHaveLength(14);
    expect(analytics.body.wellness.at(-1)).toMatchObject({
      calendarDate: today(),
      sleepDurationInSeconds: 4 * 3600,
    });

    const { pool } = h.app.get<Database>(DATABASE);
    const reads = await pool.query<{ details: unknown }>(
      "select details from audit_log where subject_user_id = $1",
      [athlete.id],
    );
    expect(reads.rows.map((r) => r.details)).toContainEqual({ scope: "sleep_recovery" });

    const stranger = await signInCoach(h);
    await h.http().get(`/v1/coach/athletes/${athlete.id}/briefing`).set(stranger.auth).expect(404);
  });
});
