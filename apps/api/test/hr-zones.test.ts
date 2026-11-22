import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signIn, startHarness, type Harness } from "./harness.js";

/** Heart-rate zones in the profile: default from max HR, or the athlete's own five zones. */
let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());

describe("heart-rate zones", () => {
  it("has none without max HR or age, then Garmin's % of max HR", async () => {
    const athlete = await signIn(h);
    const empty = await h.http().get("/v1/me/hr-zones").set(athlete.auth).expect(200);
    expect(empty.body).toMatchObject({ zones: [], maxHeartRate: null });
    await h
      .http()
      .patch("/v1/me/settings")
      .set(athlete.auth)
      .send({ maxHeartRate: 190 })
      .expect(200);
    const res = await h.http().get("/v1/me/hr-zones").set(athlete.auth).expect(200);
    expect(res.body.origin).toBe("garmin_default");
    expect(res.body.maxHeartRate).toBe(190);
    expect(res.body.zones.map((z: { minBpm: number | null }) => z.minBpm)).toEqual([
      null,
      114,
      133,
      152,
      171,
    ]);
  });

  it("saves own zones as a new version and switches to them", async () => {
    const athlete = await signIn(h);
    const res = await h
      .http()
      .put("/v1/me/hr-zones")
      .set(athlete.auth)
      .send({ lowerBounds: [120, 140, 158, 172] })
      .expect(200);
    expect(res.body).toMatchObject({ origin: "manual", source: "manual", fellBack: false });
    expect(res.body.zones).toHaveLength(5);
    expect(res.body.zones[0]).toMatchObject({ minBpm: null, maxBpm: 119 });
    expect(res.body.zones[4]).toMatchObject({ minBpm: 172, maxBpm: null });
    const settings = await h.http().get("/v1/me/settings").set(athlete.auth).expect(200);
    expect(settings.body.hrZones).toEqual({ mode: "manual" });
  });

  it("refuses bounds that do not rise, out of range or not four", async () => {
    const athlete = await signIn(h);
    const put = (lowerBounds: number[]) =>
      h.http().put("/v1/me/hr-zones").set(athlete.auth).send({ lowerBounds });
    await put([140, 120, 158, 172]).expect(422);
    await put([20, 140, 158, 172]).expect(422);
    await put([120, 140, 158]).expect(422);
    await h
      .http()
      .put("/v1/me/hr-zones")
      .send({ lowerBounds: [120, 140, 158, 172] })
      .expect(401);
  });
});
