import type { INestApplication } from "@nestjs/common";
import { exportJWK, generateKeyPair, jwtVerify, createLocalJWKSet } from "jose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { CSRF_HEADER, CSRF_VALUE, REFRESH_COOKIE } from "../src/auth/auth.controller.js";
import { LogMailer } from "../src/auth/mailer.js";
import { TokenService } from "../src/auth/token.service.js";
import { ConfigError, loadConfig } from "../src/config.js";
import {
  CapturingMailer,
  cookieValue,
  fakeProviders,
  newNonce,
  sha256Hex,
  testConfig,
} from "./auth-helpers.js";

let app: INestApplication;
let providers: Awaited<ReturnType<typeof fakeProviders>>;
const mailer = new CapturingMailer();
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  providers = await fakeProviders();
  app = await createApp(testConfig(), { idTokenKeys: providers.keys, mailer });
  await app.init();
});
afterAll(() => app.close());

async function googleSignIn(
  sub: string,
  email: string,
  client: "web" | "native" = "native",
  status = 200,
) {
  const nonce = newNonce();
  const idToken = await providers.googleToken({
    sub,
    email,
    email_verified: true,
    name: "Влатко Петревски",
    nonce,
  });
  return http().post("/v1/auth/google").send({ idToken, nonce, client }).expect(status);
}

async function emailSignIn(email: string) {
  await http().post("/v1/auth/email/start").send({ email }).expect(202);
  const res = await http()
    .post("/v1/auth/email/verify")
    .send({ token: mailer.lastTokenFor(email.toLowerCase()), client: "native" })
    .expect(200);
  return res.body as { accessToken: string; refreshToken: string; user: { id: string } };
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("sign-in methods", () => {
  it("lists the enabled providers", async () => {
    const res = await http().get("/v1/auth/providers").expect(200);
    expect(res.body).toEqual({ google: true, apple: true, email: true });
  });

  it("signs in with Google on the web: refresh token only in an HttpOnly cookie", async () => {
    const res = await googleSignIn("g-web", "vlatko@example.com", "web");
    expect(res.body).toMatchObject({
      tokenType: "Bearer",
      expiresIn: 900,
      created: true,
      user: { displayName: "Влатко Петревски", email: "vlatko@example.com", roles: ["athlete"] },
    });
    expect(res.body.refreshToken).toBeUndefined();
    const cookie = cookieValue(res.headers["set-cookie"], REFRESH_COOKIE)!;
    expect(cookie.line).toMatch(/HttpOnly/);
    expect(cookie.line).toMatch(/SameSite=Strict/);
    expect(cookie.line).toMatch(/Path=\/v1\/auth/);

    const me = await http().get("/v1/me").set(bearer(res.body.accessToken)).expect(200);
    expect(me.body.identities).toEqual([
      expect.objectContaining({ provider: "google", email: "vlatko@example.com" }),
    ]);
    expect(me.body.settings).toMatchObject({ unitSystem: "metric", timeZone: "Europe/Skopje" });

    const again = await googleSignIn("g-web", "vlatko@example.com");
    expect(again.body).toMatchObject({ created: false, user: { id: res.body.user.id } });
  });

  it("signs in with Apple (hashed nonce, name from the client) and returns tokens to native apps", async () => {
    const nonce = newNonce();
    const idToken = await providers.appleToken({
      sub: "apple-001",
      email: "relay@privaterelay.appleid.com",
      email_verified: "true",
      nonce: sha256Hex(nonce),
    });
    const res = await http()
      .post("/v1/auth/apple")
      .send({ idToken, nonce, displayName: "Ана", client: "native" })
      .expect(200);
    expect(res.body).toMatchObject({ created: true, user: { displayName: "Ана" } });
    expect(res.body.refreshToken).toMatch(/^[\w-]{43}$/);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects ID tokens with the wrong nonce, audience, issuer or expiry", async () => {
    const nonce = newNonce();
    const cases = [
      await providers.googleToken({ sub: "x", nonce: "other-nonce-value" }),
      await providers.googleToken({ sub: "x", nonce }, { audience: "someone-else" }),
      await providers.googleToken({ sub: "x", nonce }, { issuer: "https://evil.example" }),
      await providers.googleToken({ sub: "x", nonce }, { expiresIn: "-5m" }),
      await providers.appleToken({ sub: "x", nonce }), // Apple key for a Google sign-in
      await providers.googleToken({ nonce }), // no subject
    ];
    for (const idToken of cases) {
      const res = await http().post("/v1/auth/google").send({ idToken, nonce }).expect(401);
      expect(res.body).toMatchObject({ status: 401, code: "invalid" });
      expect(res.headers["www-authenticate"]).toMatch(/^Bearer/);
    }
    await http().post("/v1/auth/google").send({ idToken: "short", nonce }).expect(422);
  });

  it("ignores unverified emails", async () => {
    const nonce = newNonce();
    const idToken = await providers.googleToken({
      sub: "g-unverified",
      email: "unverified@example.com",
      email_verified: false,
      nonce,
    });
    const res = await http().post("/v1/auth/google").send({ idToken, nonce }).expect(200);
    expect(res.body.user).toMatchObject({ email: null, displayName: "ActiveN" });
  });

  it("never merges a Google account into an existing email account", async () => {
    await emailSignIn("marko@example.com");
    const res = await googleSignIn("g-marko", "marko@example.com", "native", 409);
    expect(res.body).toMatchObject({ code: "account_exists", providers: ["email"] });
  });
});

describe("email magic link", () => {
  it("answers the same for any address and sends a localized single-use link", async () => {
    await http()
      .post("/v1/auth/email/start")
      .set("Accept-Language", "mk")
      .send({ email: "Nova@Example.com" })
      .expect(202, { status: "sent" });
    const mail = mailer.sent.at(-1)!;
    expect(mail).toMatchObject({ to: "nova@example.com", subject: "Најава во ActiveN" });
    expect(mail.text).toMatch(/https:\/\/app\.activen\.test\/auth\/email#token=/);
    expect(mail.text).toMatch(/15 минути/);

    await http()
      .post("/v1/auth/email/start")
      .send({ email: "nova@example.com", locale: "en" })
      .expect(202);
    expect(mailer.sent.at(-1)!.subject).toBe("Sign in to ActiveN");

    const token = mailer.lastTokenFor("nova@example.com");
    const res = await http().post("/v1/auth/email/verify").send({ token }).expect(200);
    expect(res.body).toMatchObject({ created: true, user: { displayName: "nova" } });
    const reused = await http().post("/v1/auth/email/verify").send({ token }).expect(401);
    expect(reused.body.code).toBe("invalid");
  });

  it("validates the address", async () => {
    const res = await http()
      .post("/v1/auth/email/start")
      .send({ email: "not-an-email" })
      .expect(422);
    expect(res.body.title).toBe("Unprocessable Entity");
    await http().post("/v1/auth/email/start").send({}).expect(422);
  });
});

describe("tokens and sessions", () => {
  it("refreshes from the cookie only with the CSRF header, rotating the cookie", async () => {
    const signIn = await googleSignIn("g-cookie", "cookie@example.com", "web");
    const cookie = cookieValue(signIn.headers["set-cookie"], REFRESH_COOKIE)!.value;

    await http()
      .post("/v1/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE}=${cookie}`)
      .send({})
      .expect(403);
    const refreshed = await http()
      .post("/v1/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE}=${cookie}`)
      .set(CSRF_HEADER, CSRF_VALUE)
      .send({})
      .expect(200);
    const rotated = cookieValue(refreshed.headers["set-cookie"], REFRESH_COOKIE)!.value;
    expect(rotated).not.toBe(cookie);
    await http().get("/v1/me").set(bearer(refreshed.body.accessToken)).expect(200);

    // Logout via cookie revokes the session; the access token stops working at once.
    await http()
      .post("/v1/auth/logout")
      .set("Cookie", `${REFRESH_COOKIE}=${rotated}`)
      .set(CSRF_HEADER, CSRF_VALUE)
      .send({})
      .expect(204);
    const after = await http().get("/v1/me").set(bearer(refreshed.body.accessToken)).expect(401);
    expect(after.body.code).toBe("revoked");
  });

  it("refreshes native sessions from the body and clears cookies on failure", async () => {
    const { refreshToken } = (await googleSignIn("g-native", "native@example.com")).body;
    const res = await http()
      .post("/v1/auth/refresh")
      .send({ refreshToken, client: "native" })
      .expect(200);
    expect(res.body.refreshToken).not.toBe(refreshToken);

    const bad = await http()
      .post("/v1/auth/refresh")
      .send({ refreshToken: "x".repeat(43) })
      .expect(401);
    expect(cookieValue(bad.headers["set-cookie"], REFRESH_COOKIE)?.line).toMatch(
      /Expires=Thu, 01 Jan 1970/,
    );
    await http().post("/v1/auth/refresh").send({}).expect(401);

    await http().post("/v1/auth/logout").send({ refreshToken: res.body.refreshToken }).expect(204);
    await http().post("/v1/auth/logout").send({}).expect(204); // nothing to sign out
    await http()
      .post("/v1/auth/logout")
      .set("Cookie", `${REFRESH_COOKIE}=${"y".repeat(43)}`)
      .send({})
      .expect(403);
  });

  it("rejects missing, malformed and forged access tokens", async () => {
    const none = await http().get("/v1/me").expect(401);
    expect(none.body).toMatchObject({ code: "invalid" });
    await http().get("/v1/me").set("Authorization", "Basic abc").expect(401);
    await http().get("/v1/me").set(bearer("not.a.jwt")).expect(401);
    const other = await TokenService.create(testConfig());
    const forged = await other.issue({
      userId: "00000000-0000-0000-0000-000000000000",
      sessionId: "s",
    });
    await http().get("/v1/me").set(bearer(forged)).expect(401);
  });

  it("publishes the signing key so access tokens can be verified independently", async () => {
    const { accessToken, user } = (await googleSignIn("g-jwks", "jwks@example.com")).body;
    const jwks = (await http().get("/.well-known/jwks.json").expect(200)).body;
    expect(jwks.keys[0]).toMatchObject({ kty: "OKP", crv: "Ed25519", alg: "EdDSA", use: "sig" });
    expect(jwks.keys[0].d).toBeUndefined();
    const { payload, protectedHeader } = await jwtVerify(accessToken, createLocalJWKSet(jwks));
    expect(payload.sub).toBe(user.id);
    expect(protectedHeader.typ).toBe("at+jwt");
  });

  it("lists devices and signs out one or all others", async () => {
    const a = await emailSignIn("devices@example.com");
    const b = await emailSignIn("devices@example.com");
    const c = await emailSignIn("devices@example.com");
    const list = await http().get("/v1/me/sessions").set(bearer(a.accessToken)).expect(200);
    expect(list.body).toHaveLength(3);
    expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(list.body[0].userId).toBeUndefined();

    const bSession = (await http().get("/v1/me/sessions").set(bearer(b.accessToken))).body.find(
      (s: { current: boolean }) => s.current,
    ).id;
    await http().delete(`/v1/me/sessions/${bSession}`).set(bearer(a.accessToken)).expect(204);
    await http().get("/v1/me").set(bearer(b.accessToken)).expect(401);
    await http()
      .delete("/v1/me/sessions/00000000-0000-0000-0000-000000000000")
      .set(bearer(a.accessToken))
      .expect(404);
    await http().delete("/v1/me/sessions/not-a-uuid").set(bearer(a.accessToken)).expect(400);

    const res = await http()
      .post("/v1/me/sessions/revoke-others")
      .set(bearer(a.accessToken))
      .expect(201);
    expect(res.body).toEqual({ revoked: 1 });
    await http().get("/v1/me").set(bearer(c.accessToken)).expect(401);
    await http().get("/v1/me").set(bearer(a.accessToken)).expect(200);
  });
});

describe("profile, roles and settings", () => {
  it("updates the profile and takes on or gives up the coach role", async () => {
    const { accessToken } = await emailSignIn("coach@example.com");
    const auth = bearer(accessToken);
    const profile = await http()
      .patch("/v1/me")
      .set(auth)
      .send({ displayName: " Coach  Ana " })
      .expect(200);
    expect(profile.body.displayName).toBe("Coach Ana");
    await http().patch("/v1/me").set(auth).send({ displayName: "" }).expect(422);

    expect((await http().put("/v1/me/roles/coach").set(auth).expect(200)).body).toEqual({
      roles: ["athlete", "coach"],
    });
    await http().put("/v1/me/roles/admin").set(auth).expect(422);
    expect((await http().delete("/v1/me/roles/coach").set(auth).expect(200)).body.roles).toEqual([
      "athlete",
    ]);
    const last = await http().delete("/v1/me/roles/athlete").set(auth).expect(409);
    expect(last.body.detail).toMatch(/at least one role/);
  });

  it("reads defaults and applies partial settings changes with validation", async () => {
    const { accessToken } = await emailSignIn("settings@example.com");
    const auth = bearer(accessToken);
    expect((await http().get("/v1/me/settings").set(auth).expect(200)).body.hrZones).toEqual({
      mode: "source",
    });
    const saved = await http()
      .patch("/v1/me/settings")
      .set(auth)
      .send({ unitSystem: "imperial", hrZones: { mode: "vendor", vendor: "garmin" }, locale: "en" })
      .expect(200);
    expect(saved.body).toMatchObject({
      unitSystem: "imperial",
      hrZones: { mode: "vendor", vendor: "garmin" },
      locale: "en",
      timeZone: "Europe/Skopje",
    });
    const tz = await http()
      .patch("/v1/me/settings")
      .set(auth)
      .send({ timeZone: "Mars/Olympus" })
      .expect(422);
    expect(tz.body.detail).toMatch(/time zone/);
    const invalid = await http()
      .patch("/v1/me/settings")
      .set(auth)
      .send({ hrZones: { mode: "vendor", vendor: "manual" }, extra: 1 })
      .expect(422);
    expect(invalid.body.errors.length).toBeGreaterThanOrEqual(1);
    await http().patch("/v1/me/settings").set(auth).send({ maxHeartRate: 300 }).expect(422);
    await http().patch("/v1/me/settings").set(auth).send({ birthDate: "1980-02-30x" }).expect(422);
  });
});

describe("linking sign-in methods", () => {
  it("links Apple and an email address, and removes methods but not the last one", async () => {
    const signIn = (await googleSignIn("g-link", "link@example.com")).body;
    const auth = bearer(signIn.accessToken);

    const nonce = newNonce();
    const appleToken = await providers.appleToken({ sub: "apple-link", nonce });
    const linked = await http()
      .post("/v1/me/identities/apple")
      .set(auth)
      .send({ idToken: appleToken, nonce })
      .expect(201);
    expect(linked.body.map((i: { provider: string }) => i.provider)).toEqual(["google", "apple"]);

    await http()
      .post("/v1/me/identities/email/start")
      .set(auth)
      .send({ email: "work@example.com" })
      .expect(202);
    const linkMail = mailer.sent.at(-1)!;
    expect(linkMail.text).toMatch(/\/auth\/link-email#token=/);
    const token = mailer.lastTokenFor("work@example.com");

    const other = await emailSignIn("someone@example.com");
    await http()
      .post("/v1/me/identities/email/verify")
      .set(bearer(other.accessToken))
      .send({ token })
      .expect(401);
    // The token was consumed by the failed attempt; request a fresh one.
    await http()
      .post("/v1/me/identities/email/start")
      .set(auth)
      .send({ email: "work@example.com" })
      .expect(202);
    const ids = await http()
      .post("/v1/me/identities/email/verify")
      .set(auth)
      .send({ token: mailer.lastTokenFor("work@example.com") })
      .expect(201);
    expect(ids.body.map((i: { provider: string }) => i.provider)).toEqual([
      "google",
      "apple",
      "email",
    ]);

    // The Google account of this user cannot be linked to someone else.
    const gNonce = newNonce();
    const googleToken = await providers.googleToken({ sub: "g-link", nonce: gNonce });
    const conflict = await http()
      .post("/v1/me/identities/google")
      .set(bearer(other.accessToken))
      .send({ idToken: googleToken, nonce: gNonce })
      .expect(409);
    expect(conflict.body.detail).toMatch(/another account/);

    for (const identity of ids.body.slice(0, 2))
      await http().delete(`/v1/me/identities/${identity.id}`).set(auth).expect(200);
    const remaining = (await http().get("/v1/me/identities").set(auth).expect(200)).body;
    expect(remaining).toHaveLength(1);
    await http().delete(`/v1/me/identities/${remaining[0].id}`).set(auth).expect(409);

    // The linked email now signs in to the same account.
    expect((await emailSignIn("work@example.com")).user.id).toBe(signIn.user.id);
  });
});

describe("account deletion", () => {
  it("requires explicit confirmation and removes the account", async () => {
    const { accessToken } = await emailSignIn("delete-me@example.com");
    await http().delete("/v1/me").set(bearer(accessToken)).send({ confirm: "yes" }).expect(422);
    await http().delete("/v1/me").set(bearer(accessToken)).send({ confirm: "DELETE" }).expect(204);
    await http().get("/v1/me").set(bearer(accessToken)).expect(401);
    const again = await emailSignIn("delete-me@example.com");
    expect(
      (await http().get("/v1/me").set(bearer(again.accessToken)).expect(200)).body.user.roles,
    ).toEqual(["athlete"]);
  });
});

describe("rate limiting and configuration", () => {
  it("limits sign-in requests per client without touching other routes", async () => {
    const limited = await createApp(testConfig({ AUTH_RATE_LIMIT_PER_MINUTE: "2" }), {
      idTokenKeys: providers.keys,
      mailer,
    });
    await limited.init();
    try {
      const server = limited.getHttpServer();
      await request(server).get("/v1/auth/providers").expect(200);
      await request(server).get("/v1/auth/providers").expect(200);
      const res = await request(server).get("/v1/auth/providers").expect(429);
      expect(res.body).toMatchObject({ status: 429 });
      await request(server).get("/health/live").expect(200);
      await request(server).get("/v1/reference/locales").expect(200);
    } finally {
      await limited.close();
    }
  });

  it("disables providers without client IDs", async () => {
    const plain = await createApp(testConfig({ GOOGLE_CLIENT_IDS: "", APPLE_CLIENT_IDS: "" }), {
      mailer,
    });
    await plain.init();
    try {
      const server = plain.getHttpServer();
      expect((await request(server).get("/v1/auth/providers")).body).toEqual({
        google: false,
        apple: false,
        email: true,
      });
      await request(server)
        .post("/v1/auth/google")
        .send({ idToken: "x".repeat(40), nonce: newNonce() })
        .expect(404);
    } finally {
      await plain.close();
    }
  });

  it("requires a signing key in production and accepts a configured one", async () => {
    expect(() => testConfig({ NODE_ENV: "production" })).toThrow(ConfigError);
    const { privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
    const jwk = JSON.stringify({ ...(await exportJWK(privateKey)), kid: "prod-1" });
    const prod = testConfig({ NODE_ENV: "production", AUTH_SIGNING_KEY: jwk });
    expect(prod.COOKIE_SECURE).toBe(true);
    expect(testConfig().COOKIE_SECURE).toBe(false);
    expect(testConfig({ COOKIE_SECURE: "true" }).COOKIE_SECURE).toBe(true);
    const service = await TokenService.create(prod);
    expect(service.jwks().keys[0]!.kid).toBe("prod-1");
    const token = await service.issue({ userId: "u", sessionId: "s" });
    expect(await service.verify(token)).toEqual({ userId: "u", sessionId: "s" });
    await expect(
      TokenService.create({ ...prod, AUTH_SIGNING_KEY: JSON.stringify({ kty: "RSA" }) }),
    ).rejects.toThrow(/Ed25519/);
    const shortLived = await TokenService.create({
      ...prod,
      ACCESS_TOKEN_TTL_SECONDS: -1,
    } as never);
    await expect(
      shortLived.verify(await shortLived.issue({ userId: "u", sessionId: "s" })),
    ).rejects.toMatchObject({
      reason: "expired",
    });
    expect(
      () =>
        loadConfig({ DATABASE_URL: "postgres://x/y", GOOGLE_CLIENT_IDS: "a, b ," })
          .GOOGLE_CLIENT_IDS,
    ).not.toThrow();
  });

  it("logs emails, hiding one-time links in production", async () => {
    const dev = new LogMailer(true);
    const prod = new LogMailer(false);
    const logs: unknown[] = [];
    for (const m of [dev, prod]) {
      (m as unknown as { logger: { log: (x: unknown) => void } }).logger = {
        log: (x) => logs.push(x),
      };
      await m.send({ to: "a@example.com", subject: "S", text: "secret-link" });
    }
    expect(logs[0]).toMatchObject({ text: "secret-link" });
    expect(logs[1]).not.toHaveProperty("text");
  });
});
