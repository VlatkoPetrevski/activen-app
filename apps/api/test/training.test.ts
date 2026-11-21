import { seedDemoData, type Repositories } from "@activen/db";
import { addDays, localDateOf, weekStart } from "@activen/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signIn as harnessSignIn, startHarness, type Harness } from "./harness.js";

let h: Harness;
let repos: Repositories;
const http = () => h.http();
const signIn = (email: string) => harnessSignIn(h, email);
const today = localDateOf(new Date().toISOString(), "Europe/Skopje");

beforeAll(async () => {
  h = await startHarness();
  repos = h.repos;
});
afterAll(() => h.close());

describe("athlete training", () => {
  it("returns the calendar with plan ↔ activity links and check-ins", async () => {
    const me = await signIn("athlete1@example.com");
    await seedDemoData(repos, me.id, { today });
    const from = addDays(weekStart(today), -7);
    const res = await http()
      .get(`/v1/me/calendar?from=${from}&to=${addDays(from, 13)}`)
      .set(me.auth)
      .expect(200);
    expect(res.body).toMatchObject({ athleteId: me.id, from, activitiesVisible: true });
    expect(res.body.entries).toHaveLength(14);
    expect(res.body.links).toHaveLength(14);
    const linked = res.body.links.filter((l: { activityId: string | null }) => l.activityId);
    expect(linked.length).toBeGreaterThan(0);
    expect(res.body.activities[0]).toHaveProperty("feedback");

    await http().get("/v1/me/calendar?from=2026-12-01&to=2026-11-01").set(me.auth).expect(422);
    await http().get("/v1/me/calendar").set(me.auth).expect(422);
  });

  it("creates, edits (with version check) and removes plan entries", async () => {
    const me = await signIn("athlete2@example.com");
    const created = await http()
      .post("/v1/me/plan")
      .set(me.auth)
      .send({
        calendarDate: today,
        kind: "workout",
        description: "10 km лесно",
        plannedActivityType: "RUNNING",
        plannedDistanceInMeters: 10000,
      })
      .expect(201);
    expect(created.body).toMatchObject({ version: 1, sequence: 0, athleteId: me.id });
    expect(created.body.language).toBeUndefined();
    const updated = await http()
      .patch(`/v1/me/plan/${created.body.id}`)
      .set(me.auth)
      .send({ expectedVersion: 1, description: "12 km лесно", plannedDistanceInMeters: 12000 })
      .expect(200);
    expect(updated.body).toMatchObject({ version: 2, description: "12 km лесно" });
    await http()
      .patch(`/v1/me/plan/${created.body.id}`)
      .set(me.auth)
      .send({ expectedVersion: 1, description: "stale" })
      .expect(409);

    const other = await signIn("intruder@example.com");
    await http()
      .patch(`/v1/me/plan/${created.body.id}`)
      .set(other.auth)
      .send({ expectedVersion: 2, description: "x" })
      .expect(404);
    await http().delete(`/v1/me/plan/${created.body.id}`).set(other.auth).expect(404);
    await http().delete(`/v1/me/plan/${created.body.id}`).set(me.auth).expect(204);
    await http().delete(`/v1/me/plan/${created.body.id}`).set(me.auth).expect(404);
  });

  it("lists activities, shows details and saves the check-in", async () => {
    const me = await signIn("athlete3@example.com");
    await seedDemoData(repos, me.id, { today });
    const list = await http()
      .get(`/v1/me/activities?from=${addDays(today, -60)}&to=${today}`)
      .set(me.auth)
      .expect(200);
    expect(list.body.length).toBeGreaterThan(20);
    expect(list.body[0].startTimeInSeconds).toBeGreaterThan(list.body.at(-1).startTimeInSeconds);
    const run = list.body.find((a: { activityType: string }) => a.activityType === "RUNNING");

    const saved = await http()
      .put(`/v1/me/activities/${run.id}/feedback`)
      .set(me.auth)
      .send({ perceivedEffort: 7, feel: 3, comment: "Добро" })
      .expect(200);
    expect(saved.body).toMatchObject({ perceivedEffort: 7, feel: 3, comment: "Добро" });
    await http()
      .put(`/v1/me/activities/${run.id}/feedback`)
      .set(me.auth)
      .send({ perceivedEffort: 0, feel: 3 })
      .expect(422);

    await http()
      .post("/v1/me/comments")
      .set(me.auth)
      .send({ body: "Колено ок.", activityId: run.id })
      .expect(201);
    const detail = await http().get(`/v1/me/activities/${run.id}`).set(me.auth).expect(200);
    expect(detail.body.activity).toMatchObject({ id: run.id, feedback: { perceivedEffort: 7 } });
    expect(detail.body.planEntry).toMatchObject({ calendarDate: run.calendarDate });
    expect(Array.isArray(detail.body.insights)).toBe(true);
    expect(detail.body.insights.length).toBeGreaterThan(0);
    expect(detail.body.comments).toEqual([
      expect.objectContaining({ body: "Колено ок.", authorId: me.id }),
    ]);

    const other = await signIn("other3@example.com");
    await http().get(`/v1/me/activities/${run.id}`).set(other.auth).expect(404);
    await http()
      .post("/v1/me/comments")
      .set(other.auth)
      .send({ body: "x", activityId: run.id })
      .expect(404);
  });

  it("summarizes progress by week", async () => {
    const me = await signIn("athlete4@example.com");
    await seedDemoData(repos, me.id, { today });
    const res = await http().get("/v1/me/progress?weeks=8").set(me.auth).expect(200);
    expect(res.body.weeks).toHaveLength(8);
    expect(res.body.weeks.at(-1).key).toBe(weekStart(today));
    expect(res.body.last4Weeks.count).toBeGreaterThan(5);
    expect(res.body.previous4Weeks.distanceInMeters).toBeGreaterThan(0);
    expect(res.body.mix[0]).toMatchObject({ activityType: "RUNNING" });
    await http().get("/v1/me/progress?weeks=2").set(me.auth).expect(422);
  });
});

describe("coach workplace", () => {
  it("invites, gets accepted with consent, plans, comments and respects data sharing", async () => {
    const coach = await signIn("coach1@example.com");
    const athlete = await signIn("athlete5@example.com");
    await seedDemoData(repos, athlete.id, { today });

    await http().get("/v1/coach/athletes").set(coach.auth).expect(403);
    await http().put("/v1/me/roles/coach").set(coach.auth).expect(200);

    // Same answer for unknown addresses and for oneself.
    await http()
      .post("/v1/coach/invites")
      .set(coach.auth)
      .send({ email: "nobody@example.com" })
      .expect(202);
    await http()
      .post("/v1/coach/invites")
      .set(coach.auth)
      .send({ email: "coach1@example.com" })
      .expect(202);
    await http()
      .post("/v1/coach/invites")
      .set(coach.auth)
      .send({ email: "ATHLETE5@example.com" })
      .expect(202);
    await http()
      .post("/v1/coach/invites")
      .set(coach.auth)
      .send({ email: "athlete5@example.com" })
      .expect(202);

    const pending = await http().get("/v1/coach/athletes").set(coach.auth).expect(200);
    expect(pending.body).toEqual([
      expect.objectContaining({ athleteId: athlete.id, status: "invited", signals: [] }),
    ]);
    await http()
      .get(`/v1/coach/athletes/${athlete.id}/calendar?from=${today}&to=${today}`)
      .set(coach.auth)
      .expect(404);

    const invites = await http().get("/v1/me/coaches").set(athlete.auth).expect(200);
    expect(invites.body).toEqual([
      expect.objectContaining({ coachId: coach.id, status: "invited", scopes: [] }),
    ]);
    const linkId = invites.body[0].linkId;
    await http()
      .post(`/v1/me/coaches/${linkId}/accept`)
      .set(athlete.auth)
      .send({ scopes: ["comments"] })
      .expect(204);

    // Without the activities consent the coach sees the plan only.
    const from = addDays(weekStart(today), -7);
    const limited = await http()
      .get(`/v1/coach/athletes/${athlete.id}/calendar?from=${from}&to=${addDays(from, 13)}`)
      .set(coach.auth)
      .expect(200);
    expect(limited.body).toMatchObject({ activitiesVisible: false, activities: [] });
    expect(limited.body.entries).toHaveLength(14);
    await http().get(`/v1/coach/athletes/${athlete.id}/progress`).set(coach.auth).expect(403);

    await http()
      .put(`/v1/me/coaches/${linkId}/scopes`)
      .set(athlete.auth)
      .send({ scopes: ["activities", "comments"] })
      .expect(204);
    expect((await http().get("/v1/me/coaches").set(athlete.auth)).body[0].scopes).toEqual([
      "activities",
      "comments",
    ]);
    const full = await http()
      .get(`/v1/coach/athletes/${athlete.id}/calendar?from=${from}&to=${addDays(from, 13)}`)
      .set(coach.auth)
      .expect(200);
    expect(full.body.activitiesVisible).toBe(true);
    expect(full.body.activities.length).toBeGreaterThan(0);
    await http()
      .get(`/v1/coach/athletes/${athlete.id}/progress?weeks=4`)
      .set(coach.auth)
      .expect(200);

    // Strava activities never reach the coach (Strava API terms).
    await repos.activities.upsert({
      userId: athlete.id,
      vendor: "strava",
      externalId: "s-1",
      activityName: "Strava run",
      activityType: "RUNNING",
      calendarDate: addDays(today, -1),
      startTimeInSeconds: 1_700_000_000,
      startTimeOffsetInSeconds: 3600,
      distanceInMeters: 5000,
      durationInSeconds: 1500,
      movingDurationInSeconds: 1500,
      totalElevationGainInMeters: null,
      trainingLoad: null,
      averageHeartRateInBeatsPerMinute: null,
      maxHeartRateInBeatsPerMinute: null,
      averagePowerInWatts: null,
      activeKilocalories: null,
      gearName: null,
      isRace: false,
    });
    const day = addDays(today, -1);
    const coachView = await http()
      .get(`/v1/coach/athletes/${athlete.id}/calendar?from=${day}&to=${day}`)
      .set(coach.auth);
    expect(
      coachView.body.activities.some(
        (a: { source: { vendor: string } }) => a.source.vendor === "strava",
      ),
    ).toBe(false);
    const strava = (await repos.activities.listByDateRange(athlete.id, day, day)).find(
      (x) => x.source.vendor === "strava",
    );
    await http()
      .get(`/v1/coach/athletes/${athlete.id}/activities/${strava?.id}`)
      .set(coach.auth)
      .expect(404);
    // Analytics: the roster overview and one athlete's page.
    const overview = await http().get("/v1/coach/analytics").set(coach.auth).expect(200);
    expect(overview.body).toEqual([
      expect.objectContaining({
        athleteId: athlete.id,
        activitiesVisible: true,
        last7: expect.any(Array),
        completion28: expect.any(Object),
      }),
    ]);
    const analytics = await http()
      .get(`/v1/coach/athletes/${athlete.id}/analytics`)
      .set(coach.auth)
      .expect(200);
    expect(analytics.body.weeks).toHaveLength(12);
    expect(analytics.body.fitness).toHaveLength(84);
    // Sleep and recovery were not shared.
    expect(analytics.body.wellness).toBeNull();
    expect(
      analytics.body.activities.some(
        (x: { source: { vendor: string } }) => x.source.vendor === "strava",
      ),
    ).toBe(false);
    await http().get(`/v1/coach/athletes/${athlete.id}/analytics`).set(athlete.auth).expect(403);

    // The coach opens one shared activity: plan, laps and source.
    const shared = full.body.activities[0] as { id: string; source: { vendor: string } };
    const detail = await http()
      .get(`/v1/coach/athletes/${athlete.id}/activities/${shared.id}`)
      .set(coach.auth)
      .expect(200);
    expect(detail.body).toMatchObject({
      activity: { id: shared.id },
      laps: [],
      device: { vendor: shared.source.vendor, deviceName: null },
      route: null,
    });
    const ownView = await http().get(`/v1/me/calendar?from=${day}&to=${day}`).set(athlete.auth);
    expect(
      ownView.body.activities.some(
        (a: { source: { vendor: string } }) => a.source.vendor === "strava",
      ),
    ).toBe(true);

    // The coach plans a session; the athlete sees it and can edit it.
    const planned = await http()
      .post(`/v1/coach/athletes/${athlete.id}/plan`)
      .set(coach.auth)
      .send({
        calendarDate: addDays(today, 3),
        kind: "workout",
        description: "Темпо 8 km",
        notes: "Држи пулс под 165.",
        sequence: 1,
      })
      .expect(201);
    await http()
      .patch(`/v1/coach/athletes/${athlete.id}/plan/${planned.body.id}`)
      .set(coach.auth)
      .send({ expectedVersion: 1, description: "Темпо 9 km" })
      .expect(200);
    const athleteDay = await http()
      .get(`/v1/me/calendar?from=${addDays(today, 3)}&to=${addDays(today, 3)}`)
      .set(athlete.auth);
    expect(athleteDay.body.entries.map((e: { description: string }) => e.description)).toContain(
      "Темпо 9 km",
    );

    // Messages both ways; the athlete's message waits for a reply.
    await http()
      .post("/v1/me/comments")
      .set(athlete.auth)
      .send({ body: "Нозете тешки." })
      .expect(201);
    const list = await http().get("/v1/coach/athletes").set(coach.auth).expect(200);
    expect(list.body[0]).toMatchObject({
      status: "active",
      scopes: ["activities", "comments"],
      primarySource: "garmin",
      lastComment: { body: "Нозете тешки.", fromAthlete: true },
    });
    expect(list.body[0].signals).toContainEqual({ code: "awaiting_reply" });
    expect(list.body[0].week.planned).toBeGreaterThan(0);
    expect(list.body[0].lastActivity).not.toBeNull();

    const reply = await http()
      .post(`/v1/coach/athletes/${athlete.id}/comments`)
      .set(coach.auth)
      .send({ body: "Утре лесно 8 km.", planEntryId: planned.body.id })
      .expect(201);
    expect(reply.body).toMatchObject({ authorId: coach.id, authorName: "coach1" });
    const thread = await http().get("/v1/me/comments").set(athlete.auth).expect(200);
    expect(thread.body.map((c: { body: string }) => c.body)).toEqual([
      "Утре лесно 8 km.",
      "Нозете тешки.",
    ]);
    expect(
      (await http().get(`/v1/coach/athletes/${athlete.id}/comments`).set(coach.auth)).body,
    ).toHaveLength(2);

    // Foreign objects are rejected.
    const stranger = await signIn("stranger@example.com");
    const strangerRun = (await seedDemoData(repos, stranger.id, { today }),
    await repos.activities.listByDateRange(stranger.id, addDays(today, -14), today))[0]!;
    await http()
      .post(`/v1/coach/athletes/${athlete.id}/comments`)
      .set(coach.auth)
      .send({ body: "x", activityId: strangerRun.id })
      .expect(404);
    const [strangerPlan] = await repos.plans.listByDateRange(stranger.id, today, today);
    await http()
      .post(`/v1/coach/athletes/${athlete.id}/comments`)
      .set(coach.auth)
      .send({ body: "x", planEntryId: strangerPlan!.id })
      .expect(404);
    await http()
      .delete(`/v1/coach/athletes/${athlete.id}/plan/${strangerPlan!.id}`)
      .set(coach.auth)
      .expect(404);
    await http()
      .put(`/v1/me/coaches/${linkId}/scopes`)
      .set(stranger.auth)
      .send({ scopes: [] })
      .expect(404);

    // Either side can end it.
    await http()
      .delete(`/v1/coach/athletes/${athlete.id}/plan/${planned.body.id}`)
      .set(coach.auth)
      .expect(204);
    await http().delete(`/v1/coach/athletes/${athlete.id}`).set(coach.auth).expect(204);
    await http().delete(`/v1/coach/athletes/${athlete.id}`).set(coach.auth).expect(404);
    expect((await http().get("/v1/me/coaches").set(athlete.auth)).body).toEqual([]);
  });

  it("lets the athlete decline an invitation and flags missed and hard sessions", async () => {
    const coach = await signIn("coach2@example.com");
    await http().put("/v1/me/roles/coach").set(coach.auth).expect(200);
    const athlete = await signIn("athlete6@example.com");
    await http()
      .post("/v1/coach/invites")
      .set(coach.auth)
      .send({ email: "athlete6@example.com" })
      .expect(202);
    const [invite] = (await http().get("/v1/me/coaches").set(athlete.auth)).body;
    await http()
      .put(`/v1/me/coaches/${invite.linkId}/scopes`)
      .set(athlete.auth)
      .send({ scopes: [] })
      .expect(404);
    await http().delete(`/v1/me/coaches/${invite.linkId}`).set(athlete.auth).expect(204);
    expect((await http().get("/v1/coach/athletes").set(coach.auth)).body).toEqual([]);

    await http()
      .post("/v1/coach/invites")
      .set(coach.auth)
      .send({ email: "athlete6@example.com" })
      .expect(202);
    const [again] = (await http().get("/v1/me/coaches").set(athlete.auth)).body;
    await http()
      .post(`/v1/me/coaches/${again.linkId}/accept`)
      .set(athlete.auth)
      .send({ scopes: ["activities"] })
      .expect(204);
    // A missed workout two days ago and a hard easy session yesterday.
    await http()
      .post("/v1/me/plan")
      .set(athlete.auth)
      .send({ calendarDate: addDays(today, -2), kind: "workout", description: "8 km" })
      .expect(201);
    const { activity } = await repos.activities.upsert({
      userId: athlete.id,
      vendor: "polar",
      externalId: "p-1",
      activityName: "Run",
      activityType: "RUNNING",
      calendarDate: addDays(today, -1),
      startTimeInSeconds: 1_700_000_000,
      startTimeOffsetInSeconds: 3600,
      distanceInMeters: 8000,
      durationInSeconds: 2700,
      movingDurationInSeconds: 2650,
      totalElevationGainInMeters: 20,
      trainingLoad: 60,
      averageHeartRateInBeatsPerMinute: 150,
      maxHeartRateInBeatsPerMinute: 165,
      averagePowerInWatts: null,
      activeKilocalories: 500,
      gearName: null,
      isRace: false,
    });
    await http()
      .put(`/v1/me/activities/${activity.id}/feedback`)
      .set(athlete.auth)
      .send({ perceivedEffort: 9, feel: 2 })
      .expect(200);
    const [row] = (await http().get("/v1/coach/athletes").set(coach.auth)).body;
    expect(row.signals).toEqual([
      { code: "missed_sessions", count: 1 },
      { code: "high_effort_on_easy_day", perceivedEffort: 9, calendarDate: addDays(today, -1) },
    ]);
    expect(row.primarySource).toBe("garmin");
  });
});
