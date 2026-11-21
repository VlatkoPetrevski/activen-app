import { bytesOf, garminTcx, intervalRunFit, START, stravaGpx } from "@activen/importers/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addActivity,
  link,
  signIn,
  signInCoach,
  startHarness,
  type Harness,
  type TestUser,
} from "./harness.js";

/**
 * Uploading activity files: a workout is stored and shown once, whatever arrives twice — the
 * same file, the same run in another format, or a run already synced from a connected app.
 */
let h: Harness;
const DAY = "2026-11-18";
const startS = START.getTime() / 1000;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());

const upload = (user: TestUser, ...files: [string, Uint8Array][]) => {
  let req = h.http().post("/v1/me/activities/import").set(user.auth);
  for (const [name, bytes] of files) req = req.attach("files", Buffer.from(bytes), name);
  return req;
};

const activitiesOn = async (user: TestUser) =>
  (await h.http().get(`/v1/me/activities?from=${DAY}&to=${DAY}`).set(user.auth).expect(200))
    .body as {
    id: string;
    activityName: string;
    source: { vendor: string };
    distanceInMeters: number;
  }[];

describe("importing files", () => {
  it("creates an activity with laps, device and route from a FIT file", async () => {
    const athlete = await signIn(h);
    const res = await upload(athlete, [
      "Трчање-интервали.fit",
      intervalRunFit({ strap: true }),
    ]).expect(200);
    expect(res.body.results).toEqual([
      {
        fileName: "Трчање-интервали.fit",
        status: "imported",
        activityId: expect.any(String),
        activityName: "Трчање",
        activityType: "RUNNING",
        calendarDate: DAY,
        mergedWith: null,
        error: null,
      },
    ]);
    const [activity] = await activitiesOn(athlete);
    expect(activity).toMatchObject({ source: { vendor: "manual" }, activityName: "Трчање" });
    expect(activity!.distanceInMeters).toBeCloseTo(6317.4, 0);

    const detail = await h
      .http()
      .get(`/v1/me/activities/${activity!.id}`)
      .set(athlete.auth)
      .expect(200);
    expect(detail.body.laps).toHaveLength(8);
    expect(detail.body.laps[1]).toMatchObject({
      index: 1,
      intensity: "active",
      startOffsetInSeconds: 600,
      averageHeartRateInBeatsPerMinute: 168,
    });
    expect(detail.body.device).toEqual({
      vendor: "manual",
      deviceName: "Forerunner 965",
      heartRateSensor: "chest_strap",
      heartRateSensorName: null,
    });
    expect(detail.body.route.points.length).toBeGreaterThan(1);
    expect(detail.body.route.points[0][0]).toBeCloseTo(41.998, 2);
    // The original is kept for re-reading.
    expect([...h.files.files.keys()]).toContainEqual(
      expect.stringMatching(new RegExp(`^${athlete.id}/[0-9a-f]{64}\\.fit$`)),
    );
  });

  it("refuses the same file twice and the same run in another format", async () => {
    const athlete = await signIn(h);
    const fit = intervalRunFit();
    const first = await upload(athlete, ["run.fit", fit]).expect(200);
    const id = first.body.results[0].activityId;
    const again = await upload(athlete, ["copy-of-run.fit", fit]).expect(200);
    expect(again.body.results[0]).toMatchObject({ status: "duplicate", activityId: id });
    // A GPX of the same run: same start, about the same length (within 15 %).
    const gpx = await upload(athlete, ["run.gpx", bytesOf(stravaGpx(1800))]).expect(200);
    expect(gpx.body.results[0]).toMatchObject({ status: "duplicate", activityId: id });
    expect(await activitiesOn(athlete)).toHaveLength(1);
    const summary = await h.http().get("/v1/me/imports").set(athlete.auth).expect(200);
    expect(summary.body.imported).toBe(1);
    expect(summary.body.recent.map((r: { status: string }) => r.status)).toEqual([
      "duplicate",
      "duplicate",
      "imported",
    ]);
  });

  it("joins a run already synced from an app and shows it once, from the app", async () => {
    const athlete = await signIn(h);
    // Polar delivered the run (no laps, a slightly different start and length).
    const polar = await addActivity(h, athlete.id, DAY, {
      vendor: "polar",
      activityName: "Polar run",
      startTimeInSeconds: startS + 20,
      durationInSeconds: 1880,
      distanceInMeters: 6300,
      trainingLoad: null,
    });
    const res = await upload(athlete, ["watch.fit", intervalRunFit({ strap: true })]).expect(200);
    expect(res.body.results[0]).toMatchObject({
      status: "merged",
      mergedWith: "polar",
      activityId: polar.id,
      activityName: "Polar run",
    });
    const list = await activitiesOn(athlete);
    expect(list).toHaveLength(1);
    // The app is the primary source; the file fills what the app lacked (Training Load).
    expect(list[0]).toMatchObject({
      id: polar.id,
      source: { vendor: "polar" },
      distanceInMeters: 6300,
    });
    const detail = await h
      .http()
      .get(`/v1/me/activities/${polar.id}`)
      .set(athlete.auth)
      .expect(200);
    expect(detail.body.activity.trainingLoad).toBe(142.4);
    expect(detail.body.laps).toHaveLength(8);
    expect(detail.body.device).toMatchObject({ vendor: "manual", deviceName: "Forerunner 965" });
    const cal = await h
      .http()
      .get(`/v1/me/calendar?from=${DAY}&to=${DAY}`)
      .set(athlete.auth)
      .expect(200);
    expect(cal.body.activities).toHaveLength(1);
  });

  it("keeps the check-in when a more trusted source arrives later", async () => {
    const athlete = await signIn(h);
    const res = await upload(athlete, ["run.fit", intervalRunFit()]).expect(200);
    const fileId = res.body.results[0].activityId;
    await h
      .http()
      .put(`/v1/me/activities/${fileId}/feedback`)
      .set(athlete.auth)
      .send({ perceivedEffort: 8, feel: 2, comment: "Heavy legs" })
      .expect(200);
    const garmin = await addActivity(h, athlete.id, DAY, {
      vendor: "garmin",
      startTimeInSeconds: startS,
      durationInSeconds: 1890,
    });
    const [shown] = (
      await h.http().get(`/v1/me/activities?from=${DAY}&to=${DAY}`).set(athlete.auth)
    ).body;
    expect(shown).toMatchObject({
      id: garmin.id,
      feedback: { perceivedEffort: 8, comment: "Heavy legs" },
    });
    // The old id still opens the workout.
    const viaOld = await h.http().get(`/v1/me/activities/${fileId}`).set(athlete.auth).expect(200);
    expect(viaOld.body.activity.id).toBe(garmin.id);
  });

  it("reports each file of a batch, in order, with reasons for failures", async () => {
    const athlete = await signIn(h);
    const res = await upload(
      athlete,
      ["notes.txt", bytesOf("not an activity")],
      ["route.gpx", bytesOf(stravaGpx(10, { times: false }))],
      ["empty.fit", new Uint8Array()],
      ["ride.tcx", bytesOf(garminTcx())],
    ).expect(200);
    expect(
      res.body.results.map((r: { status: string; error: string | null }) => [r.status, r.error]),
    ).toEqual([
      ["failed", "unsupported_format"],
      ["failed", "no_activity"],
      ["failed", "empty"],
      ["imported", null],
    ]);
    expect(res.body.results[3]).toMatchObject({ fileName: "ride.tcx", activityType: "RUNNING" });
  });

  it("dates a file without a time zone in the athlete's zone, and names it in their language", async () => {
    const athlete = await signIn(h);
    await h
      .http()
      .patch("/v1/me/settings")
      .set(athlete.auth)
      .send({ timeZone: "America/Los_Angeles", locale: "en" })
      .expect(200);
    // 06:00 UTC on the 18th is 22:00 on the 17th in Los Angeles.
    const res = await upload(athlete, [
      "evening.tcx",
      bytesOf(garminTcx().replace(/<Notes>.*<\/Notes>/, "")),
    ]).expect(200);
    expect(res.body.results[0]).toMatchObject({ calendarDate: "2026-11-17", activityName: "Run" });
    const [a] = (
      await h
        .http()
        .get("/v1/me/activities?from=2026-11-17&to=2026-11-17")
        .set(athlete.auth)
        .expect(200)
    ).body;
    expect(a.startTimeOffsetInSeconds).toBe(-8 * 3600);
  });

  it("needs a signed-in user and at least one file", async () => {
    await h.http().post("/v1/me/activities/import").expect(401);
    const athlete = await signIn(h);
    await h.http().post("/v1/me/activities/import").set(athlete.auth).expect(422);
  });

  it("never mixes athletes: the same shared file imports for each of them", async () => {
    const a = await signIn(h);
    const b = await signIn(h);
    const fit = intervalRunFit();
    await upload(a, ["group-run.fit", fit]).expect(200);
    const res = await upload(b, ["group-run.fit", fit]).expect(200);
    expect(res.body.results[0].status).toBe("imported");
    expect(await activitiesOn(a)).toHaveLength(1);
    expect(await activitiesOn(b)).toHaveLength(1);
  });

  it("deletes the kept originals with the account", async () => {
    const athlete = await signIn(h);
    await upload(athlete, ["run.fit", intervalRunFit()]).expect(200);
    const mine = () => [...h.files.files.keys()].filter((k) => k.startsWith(athlete.id));
    expect(mine()).toHaveLength(1);
    await h.http().delete("/v1/me").set(athlete.auth).send({ confirm: "DELETE" }).expect(204);
    expect(mine()).toHaveLength(0);
  });
});

describe("imported details for the coach", () => {
  it("shows laps and device with the activities consent, the route only with location", async () => {
    const coach = await signInCoach(h);
    const athlete = await signIn(h);
    const linkId = await link(h, coach, athlete, ["activities"]);
    const res = await upload(athlete, ["run.fit", intervalRunFit({ strap: true })]).expect(200);
    const id = res.body.results[0].activityId;
    const seen = await h
      .http()
      .get(`/v1/coach/athletes/${athlete.id}/activities/${id}`)
      .set(coach.auth)
      .expect(200);
    expect(seen.body.laps).toHaveLength(8);
    expect(seen.body.device.heartRateSensor).toBe("chest_strap");
    expect(seen.body.route).toBeNull();
    await h
      .http()
      .put(`/v1/me/coaches/${linkId}/scopes`)
      .set(athlete.auth)
      .send({ scopes: ["activities", "location"] })
      .expect(204);
    const withGps = await h
      .http()
      .get(`/v1/coach/athletes/${athlete.id}/activities/${id}`)
      .set(coach.auth)
      .expect(200);
    expect(withGps.body.route.points.length).toBeGreaterThan(1);
  });
});

describe("upload rate limit", () => {
  it("answers 429 past the configured uploads per minute", async () => {
    const limited = await startHarness({}, { IMPORT_RATE_LIMIT_PER_MINUTE: "2" });
    try {
      const athlete = await signIn(limited);
      const send = () =>
        limited
          .http()
          .post("/v1/me/activities/import")
          .set(athlete.auth)
          .attach("files", Buffer.from("x"), "x.txt");
      await send().expect(200);
      await send().expect(200);
      await send().expect(429);
      // Other endpoints are not affected.
      await limited.http().get("/v1/me/imports").set(athlete.auth).expect(200);
    } finally {
      await limited.close();
    }
  });
});
