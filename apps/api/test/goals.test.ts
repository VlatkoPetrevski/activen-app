import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { link, signIn, signInCoach, startHarness, type Harness } from "./harness.js";

/** The athlete's goal: written by the athlete or the coach, read as a race with training paces. */
let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());

describe("goal", () => {
  it("has none, then reads a written goal as a race with Daniels' paces", async () => {
    const athlete = await signIn(h);
    await h.http().get("/v1/me/goal").set(athlete.auth).expect(204);
    const res = await h
      .http()
      .put("/v1/me/goal")
      .set(athlete.auth)
      .send({ text: "Маратон за 3:30", raceDate: "2027-04-11" })
      .expect(200);
    expect(res.body).toMatchObject({
      text: "Маратон за 3:30",
      raceDate: "2027-04-11",
      setBy: { id: athlete.id },
      race: { race: "marathon", seconds: 12600 },
    });
    expect(Math.round(res.body.paces.paces.M)).toBe(299);
    expect(Math.round(res.body.paces.paces.HM)).toBe(288);
    // Words without a race and time are kept, without paces.
    const plain = await h
      .http()
      .put("/v1/me/goal")
      .set(athlete.auth)
      .send({ text: "Да трчам за здравје" })
      .expect(200);
    expect(plain.body).toMatchObject({ race: null, paces: null, raceDate: null });
    await h.http().delete("/v1/me/goal").set(athlete.auth).expect(204);
    await h.http().get("/v1/me/goal").set(athlete.auth).expect(204);
  });

  it("refuses an empty or too long text and an unknown field", async () => {
    const athlete = await signIn(h);
    const put = (body: object) => h.http().put("/v1/me/goal").set(athlete.auth).send(body);
    await put({ text: "  " }).expect(422);
    await put({ text: "x".repeat(301) }).expect(422);
    await put({ text: "HM 1:45", paces: {} }).expect(422);
  });

  it("is written by the linked coach too; others get 404", async () => {
    const coach = await signInCoach(h);
    const athlete = await signIn(h);
    await link(h, coach, athlete, ["activities"]);
    const res = await h
      .http()
      .put(`/v1/coach/athletes/${athlete.id}/goal`)
      .set(coach.auth)
      .send({ text: "HM 1:45" })
      .expect(200);
    expect(res.body).toMatchObject({ setBy: { id: coach.id }, race: { race: "half" } });
    const mine = await h.http().get("/v1/me/goal").set(athlete.auth).expect(200);
    expect(mine.body.text).toBe("HM 1:45");
    const stranger = await signInCoach(h);
    await h.http().get(`/v1/coach/athletes/${athlete.id}/goal`).set(stranger.auth).expect(404);
    await h
      .http()
      .put(`/v1/coach/athletes/${athlete.id}/goal`)
      .set(stranger.auth)
      .send({ text: "5k 20:00" })
      .expect(404);
  });
});
