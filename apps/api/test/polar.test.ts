import { randomBytes, createHmac } from "node:crypto";
import { intervalRunFit } from "@activen/importers/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PolarClient } from "../src/connections/polar.client.js";
import { SyncWorker } from "../src/connections/sync.worker.js";
import { signIn, startHarness, type Harness, type TestUser } from "./harness.js";

/**
 * Polar Flow as a connected app, against a simulated Polar: OAuth with a signed state, the first
 * sync, webhooks (signature, retries), duplicates with uploaded files and disconnecting.
 */
const WEBHOOK_SECRET = "polar-webhook-secret";
const KEY = randomBytes(32).toString("base64");
const API = "https://api.activen.test";
const DAY = "2026-11-18";

interface Call {
  method: string;
  url: string;
  body: string | null;
}

class FakePolar {
  calls: Call[] = [];
  userId = 4711;
  exercises: Record<string, Uint8Array> = {};
  listStatus = 200;
  registered = new Set<string>();
  nights: Record<string, unknown>[] = [];
  recharges: Record<string, unknown>[] = [];

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : init?.body ? String(init.body) : null;
    this.calls.push({ method, url, body });
    const json = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url === "https://polarremote.com/v2/oauth2/token")
      return body?.includes("code=good")
        ? json(200, {
            access_token: "polar-secret-token",
            token_type: "bearer",
            x_user_id: this.userId,
            expires_in: 315360000,
          })
        : json(400, { error: "invalid_grant" });
    const path = url.replace("https://www.polaraccesslink.com", "");
    if (method === "POST" && path === "/v3/users") {
      const member = (JSON.parse(body ?? "{}") as { "member-id": string })["member-id"];
      if (this.registered.has(member)) return json(409, {});
      this.registered.add(member);
      return json(200, { "polar-user-id": this.userId });
    }
    if (method === "DELETE" && path.startsWith("/v3/users/"))
      return new Response(null, { status: 204 });
    if (path === "/v3/exercises")
      return this.listStatus === 200
        ? json(
            200,
            Object.keys(this.exercises).map((id) => ({ id })),
          )
        : json(this.listStatus, {});
    if (path === "/v3/users/sleep") return json(200, { nights: this.nights });
    if (path === "/v3/users/nightly-recharge") return json(200, { recharges: this.recharges });
    const night = /^\/v3\/users\/sleep\/(.+)$/.exec(path);
    if (night) {
      const n = this.nights.find((x) => x.date === night[1]);
      return n ? json(200, n) : json(404, {});
    }
    const recharge = /^\/v3\/users\/nightly-recharge\/(.+)$/.exec(path);
    if (recharge) {
      const r = this.recharges.find((x) => x.date === recharge[1]);
      return r ? json(200, r) : new Response(null, { status: 204 });
    }
    const fit = /^\/v3\/exercises\/([^/]+)\/fit$/.exec(path);
    if (fit && this.exercises[fit[1]!])
      return new Response(this.exercises[fit[1]!], { status: 200 });
    return json(404, {});
  };
}

let h: Harness;
let polar: FakePolar;

beforeAll(async () => {
  polar = new FakePolar();
  h = await startHarness(
    { polarClient: new PolarClient("client-1", "secret-1", polar.fetch) },
    {
      ACTIVEN_TOKEN_KEY: KEY,
      POLAR_WEBHOOK_SECRET: WEBHOOK_SECRET,
      SYNC_INTERVAL_SECONDS: "0",
      PUBLIC_API_URL: API,
    },
  );
});
afterAll(() => h.close());

const shifted = (hours: number) =>
  intervalRunFit({ manufacturer: "polarElectro", product: 1, startShiftSeconds: hours * 3600 });

async function connect(user: TestUser) {
  const start = await h.http().post("/v1/me/connections/polar").set(user.auth).expect(200);
  const url = new URL(start.body.authorizeUrl as string);
  const state = url.searchParams.get("state")!;
  const back = await h
    .http()
    .get(`/v1/connections/polar/callback?code=good&state=${encodeURIComponent(state)}`)
    .expect(302);
  return { url, state, location: back.headers.location as string };
}

const activities = async (user: TestUser) =>
  (await h.http().get(`/v1/me/activities?from=${DAY}&to=${DAY}`).set(user.auth).expect(200))
    .body as {
    id: string;
    source: { vendor: string };
  }[];

const signed = (payload: object) => {
  const raw = JSON.stringify(payload);
  return { raw, signature: createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex") };
};

describe("connecting Polar", () => {
  it("connects through Polar Flow and imports the last 30 days", async () => {
    polar.exercises = { ex1: shifted(0), ex2: shifted(5) };
    const athlete = await signIn(h);
    const before = await h.http().get("/v1/me/connections").set(athlete.auth).expect(200);
    expect(before.body).toEqual([
      expect.objectContaining({ vendor: "polar", available: true, connected: false }),
    ]);

    const { url, location } = await connect(athlete);
    expect(url.origin + url.pathname).toBe("https://flow.polar.com/oauth2/authorization");
    expect(url.searchParams.get("client_id")).toBe("client-1");
    expect(url.searchParams.get("redirect_uri")).toBe(`${API}/v1/connections/polar/callback`);
    expect(location).toBe("https://app.activen.test/profile?polar=connected");
    // Registered with our member id = the ActiveN user id.
    expect(polar.registered.has(athlete.id)).toBe(true);

    const list = await activities(athlete);
    expect(list).toHaveLength(2);
    expect(list.every((a) => a.source.vendor === "polar")).toBe(true);
    const detail = await h
      .http()
      .get(`/v1/me/activities/${list[0]!.id}`)
      .set(athlete.auth)
      .expect(200);
    expect(detail.body.laps).toHaveLength(8);
    expect(detail.body.device).toMatchObject({ vendor: "polar", deviceName: "Polar" });

    const after = await h.http().get("/v1/me/connections").set(athlete.auth).expect(200);
    expect(after.body[0]).toMatchObject({ connected: true, status: "active", lastError: null });
    // The token is stored encrypted.
    const stored = await h.repos.connections.get(athlete.id, "polar");
    expect(Buffer.from(stored!.accessTokenEnc!).toString()).not.toContain("polar-secret-token");

    // Syncing again changes nothing: the same exercises are updated, not duplicated.
    const sync = await h.http().post("/v1/me/connections/polar/sync").set(athlete.auth).expect(200);
    expect(sync.body).toEqual({ stored: 2, skipped: 0, mornings: 0 });
    expect(await activities(athlete)).toHaveLength(2);
    await h.http().delete("/v1/me/connections/polar").set(athlete.auth).expect(204);
  });

  it("refuses forged, expired or missing approvals, and a Polar account of another user", async () => {
    polar.exercises = {};
    const athlete = await signIn(h);
    const start = await h.http().post("/v1/me/connections/polar").set(athlete.auth).expect(200);
    const state = new URL(start.body.authorizeUrl).searchParams.get("state")!;
    const forged = `${state.split(".")[0]}.AAAA`;
    for (const [query, result] of [
      [`code=good&state=${encodeURIComponent(forged)}`, "expired"],
      ["state=x", "denied"],
      ["error=access_denied", "denied"],
      [`code=bad&state=${encodeURIComponent(state)}`, "error"],
    ] as const) {
      const res = await h.http().get(`/v1/connections/polar/callback?${query}`).expect(302);
      expect(res.headers.location).toBe(`https://app.activen.test/profile?polar=${result}`);
    }
    expect(await h.repos.connections.get(athlete.id, "polar")).toBeNull();

    // The same Polar account cannot be attached to a second ActiveN user.
    const owner = await signIn(h);
    await connect(owner);
    const { location } = await connect(athlete);
    expect(location).toBe("https://app.activen.test/profile?polar=taken");
    await h.http().delete("/v1/me/connections/polar").set(owner.auth).expect(204);
  });
});

describe("Polar webhooks", () => {
  it("verifies signatures, ignores repeats and imports new workouts in the background", async () => {
    polar.exercises = {};
    const athlete = await signIn(h);
    await connect(athlete);
    await h
      .http()
      .post("/v1/webhooks/polar")
      .set("Polar-Webhook-Event", "PING")
      .send({ event: "PING", timestamp: "2026-11-18T07:00:00Z" })
      .expect(200);

    polar.exercises = { ex9: shifted(0) };
    const payload = {
      event: "EXERCISE",
      user_id: polar.userId,
      entity_id: "ex9",
      timestamp: "2026-11-18T07:00:00Z",
      url: "https://www.polaraccesslink.com/v3/exercises/ex9",
    };
    const { raw, signature } = signed(payload);
    await h
      .http()
      .post("/v1/webhooks/polar")
      .set("Content-Type", "application/json")
      .set("Polar-Webhook-Signature", "0".repeat(64))
      .send(raw)
      .expect(401);
    await h
      .http()
      .post("/v1/webhooks/polar")
      .set("Content-Type", "application/json")
      .send(raw)
      .expect(401);
    for (let i = 0; i < 2; i++)
      await h
        .http()
        .post("/v1/webhooks/polar")
        .set("Content-Type", "application/json")
        .set("Polar-Webhook-Event", "EXERCISE")
        .set("Polar-Webhook-Signature", signature)
        .send(raw)
        .expect(200);
    await h.app.get(SyncWorker).runOnce();
    const list = await activities(athlete);
    expect(list).toHaveLength(1);
    expect(list[0]!.source.vendor).toBe("polar");
    // The repeated delivery did not queue a second import.
    expect(polar.calls.filter((c) => c.url.endsWith("/ex9/fit"))).toHaveLength(1);
    await h.http().delete("/v1/me/connections/polar").set(athlete.auth).expect(204);
  });
});

describe("Polar sleep and Nightly Recharge", () => {
  it("stores the mornings on connect and on webhooks, and removes them on disconnect", async () => {
    polar.exercises = {};
    polar.nights = [
      {
        date: "2026-11-19",
        sleep_end_time: "2026-11-20T06:40:00+01:00",
        light_sleep: 14_000,
        deep_sleep: 6_000,
        rem_sleep: 5_000,
        unrecognized_sleep_stage: 200,
        sleep_score: 77,
      },
      { date: "bad" },
    ];
    polar.recharges = [
      {
        date: "2026-11-20",
        heart_rate_avg: 51.4,
        heart_rate_variability_avg: 58,
        nightly_recharge_status: 3,
      },
    ];
    const athlete = await signIn(h);
    await connect(athlete);
    const morning = async (date: string) =>
      (await h.http().get(`/v1/me/briefing?date=${date}`).set(athlete.auth).expect(200)).body.today;
    expect(await morning("2026-11-20")).toMatchObject({
      sleepDurationInSeconds: 25_200,
      sleepScore: 77,
      restingHeartRate: 51,
      lastNightHrvMs: 58,
      vendorReadiness: 50,
      sources: { sleepScore: "polar", restingHeartRate: "polar" },
    });

    // The next night arrives by webhook: sleep first, then the recharge.
    polar.nights.push({ date: "2026-11-21", light_sleep: 20_000, sleep_score: 82 });
    polar.recharges.push({
      date: "2026-11-21",
      heart_rate_avg: 49,
      heart_rate_variability_avg: 64,
    });
    for (const event of ["SLEEP", "NIGHTLY_RECHARGE"]) {
      const { raw, signature } = signed({
        event,
        user_id: polar.userId,
        date: "2026-11-21",
        timestamp: "2026-11-21T05:00:00Z",
      });
      await h
        .http()
        .post("/v1/webhooks/polar")
        .set("Content-Type", "application/json")
        .set("Polar-Webhook-Signature", signature)
        .send(raw)
        .expect(200);
    }
    await h.app.get(SyncWorker).runOnce();
    expect(await morning("2026-11-21")).toMatchObject({
      sleepDurationInSeconds: 20_000,
      sleepScore: 82,
      restingHeartRate: 49,
      lastNightHrvMs: 64,
    });

    // A webhook without a date re-reads the 28 days; one for a missing night changes nothing.
    for (const payload of [
      { event: "SLEEP", user_id: polar.userId, timestamp: "2026-11-21T05:10:00Z" },
      {
        event: "NIGHTLY_RECHARGE",
        user_id: polar.userId,
        date: "2026-11-01",
        timestamp: "2026-11-21T05:11:00Z",
      },
      {
        event: "ACTIVITY_SUMMARY",
        user_id: polar.userId,
        date: "2026-11-21",
        timestamp: "2026-11-21T05:12:00Z",
      },
    ]) {
      const { raw, signature } = signed(payload);
      await h
        .http()
        .post("/v1/webhooks/polar")
        .set("Content-Type", "application/json")
        .set("Polar-Webhook-Signature", signature)
        .send(raw)
        .expect(200);
    }
    await h.app.get(SyncWorker).runOnce();
    const sync = await h.http().post("/v1/me/connections/polar/sync").set(athlete.auth).expect(200);
    expect(sync.body).toEqual({ stored: 0, skipped: 0, mornings: 2 });

    await h.http().delete("/v1/me/connections/polar").set(athlete.auth).expect(204);
    expect(await morning("2026-11-21")).toBeNull();
    polar.nights = [];
    polar.recharges = [];
  });
});

describe("Polar with uploaded files", () => {
  it("shows a workout once when it came both as a file and from Polar, and keeps files on disconnect", async () => {
    polar.exercises = {};
    const athlete = await signIn(h);
    const file = intervalRunFit({ strap: true });
    const up = await h
      .http()
      .post("/v1/me/activities/import")
      .set(athlete.auth)
      .attach("files", Buffer.from(file), "watch.fit")
      .expect(200);
    expect(up.body.results[0].status).toBe("imported");
    const other = intervalRunFit({ startShiftSeconds: 86_400 });
    await h
      .http()
      .post("/v1/me/activities/import")
      .set(athlete.auth)
      .attach("files", Buffer.from(other), "next-day.fit")
      .expect(200);

    polar.exercises = { same: shifted(0) };
    await connect(athlete);
    // Polar (a connected app) comes before files: one activity, from Polar.
    const list = await activities(athlete);
    expect(list).toHaveLength(1);
    expect(list[0]!.source.vendor).toBe("polar");
    const detail = await h
      .http()
      .get(`/v1/me/activities/${list[0]!.id}`)
      .set(athlete.auth)
      .expect(200);
    expect(detail.body.laps).toHaveLength(8);

    // Disconnecting removes Polar's copy; the uploaded file shows again, nothing is lost.
    await h.http().delete("/v1/me/connections/polar").set(athlete.auth).expect(204);
    expect(
      polar.calls.some((c) => c.method === "DELETE" && c.url.endsWith(`/v3/users/${polar.userId}`)),
    ).toBe(true);
    const back = await activities(athlete);
    expect(back).toHaveLength(1);
    expect(back[0]!.source.vendor).toBe("manual");
    const conns = await h.http().get("/v1/me/connections").set(athlete.auth).expect(200);
    expect(conns.body[0]).toMatchObject({ connected: false });
  });
});

describe("Polar errors and configuration", () => {
  it("reports an unreachable Polar and needs a connection to sync or disconnect", async () => {
    polar.exercises = {};
    const athlete = await signIn(h);
    await h.http().post("/v1/me/connections/polar/sync").set(athlete.auth).expect(404);
    await h.http().delete("/v1/me/connections/polar").set(athlete.auth).expect(404);
    await connect(athlete);
    polar.listStatus = 500;
    await h.http().post("/v1/me/connections/polar/sync").set(athlete.auth).expect(502);
    const conns = await h.http().get("/v1/me/connections").set(athlete.auth).expect(200);
    expect(conns.body[0]).toMatchObject({
      status: "error",
      lastError: expect.stringContaining("500"),
    });
    polar.listStatus = 200;
    await h.http().delete("/v1/me/connections/polar").set(athlete.auth).expect(204);
  });

  it("is unavailable without credentials", async () => {
    const plain = await startHarness({ polarClient: null });
    try {
      const athlete = await signIn(plain);
      const conns = await plain.http().get("/v1/me/connections").set(athlete.auth).expect(200);
      expect(conns.body[0]).toMatchObject({ vendor: "polar", available: false, connected: false });
      await plain.http().post("/v1/me/connections/polar").set(athlete.auth).expect(503);
      await plain
        .http()
        .post("/v1/webhooks/polar")
        .set("Content-Type", "application/json")
        .send({ event: "EXERCISE" })
        .expect(401);
    } finally {
      await plain.close();
    }
  });
});
