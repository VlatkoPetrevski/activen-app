import { describe, expect, it } from "vitest";
import {
  AccountExistsError,
  AuthError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../src/errors.js";
import { LoginTokensRepository } from "../src/repositories/login-tokens.js";
import { DEFAULT_SESSION_POLICY, SessionsRepository } from "../src/repositories/sessions.js";
import { createUser, useDatabase } from "./helpers.js";

const { database, repos } = useDatabase();

const google = (subject: string, email: string | null, displayName = "Влатко") => ({
  provider: "google" as const,
  subject,
  email,
  displayName,
});

describe("sign-in identities", () => {
  it("links a magic-link sign-in to the existing account with that email", async () => {
    const { user } = await repos().users.findOrCreateByIdentity(
      google("g-1", "Vlatko@Example.com"),
    );
    const viaEmail = await repos().users.findOrCreateByIdentity({
      provider: "email",
      subject: " VLATKO@example.com ",
      email: "vlatko@example.com",
      displayName: "",
    });
    expect(viaEmail).toMatchObject({ created: false, user: { id: user.id } });
    expect((await repos().users.identities(user.id)).map((i) => i.provider)).toEqual([
      "google",
      "email",
    ]);
  });

  it("rejects Google/Apple sign-in for an email owned by another account", async () => {
    await repos().users.findOrCreateByIdentity({
      provider: "email",
      subject: "ana@example.com",
      email: "ana@example.com",
      displayName: "",
    });
    const attempt = repos().users.findOrCreateByIdentity({
      provider: "apple",
      subject: "a-1",
      email: "ana@example.com",
      displayName: "Ana",
    });
    await expect(attempt).rejects.toBeInstanceOf(AccountExistsError);
    await expect(attempt).rejects.toMatchObject({ providers: ["email"] });
  });

  it("names new accounts sensibly and handles concurrent first sign-ins", async () => {
    const apple = await repos().users.findOrCreateByIdentity({
      provider: "apple",
      subject: "a-2",
      email: null,
      displayName: "  ",
    });
    expect(apple.user).toMatchObject({ displayName: "ActiveN", email: null });
    const email = await repos().users.findOrCreateByIdentity({
      provider: "email",
      subject: "marko.p@example.com",
      email: "marko.p@example.com",
      displayName: "",
      roles: ["coach", "coach"],
    });
    expect(email.user).toMatchObject({ displayName: "marko.p", roles: ["coach"] });

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        repos().users.findOrCreateByIdentity(google("g-race", "race@example.com")),
      ),
    );
    expect(new Set(results.map((r) => r.user.id)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
  });

  it("links and unlinks sign-in methods, keeping at least one", async () => {
    const a = await createUser(repos(), "A");
    const b = await createUser(repos(), "B");
    const linked = await repos().users.linkIdentity(a.id, {
      provider: "apple",
      subject: "apple-a",
      email: "A@privaterelay.appleid.com",
    });
    expect(linked.map((i) => [i.provider, i.email])).toEqual([
      ["google", expect.any(String)],
      ["apple", "a@privaterelay.appleid.com"],
    ]);
    await repos().users.linkIdentity(a.id, { provider: "apple", subject: "apple-a", email: null });
    await expect(
      repos().users.linkIdentity(b.id, { provider: "apple", subject: "apple-a", email: null }),
    ).rejects.toBeInstanceOf(ConflictError);

    const apple = linked.find((i) => i.provider === "apple")!;
    const google = linked.find((i) => i.provider === "google")!;
    expect(await repos().users.unlinkIdentity(a.id, google.id)).toHaveLength(1);
    await expect(repos().users.unlinkIdentity(a.id, apple.id)).rejects.toThrow(/last sign-in/);
    await expect(repos().users.unlinkIdentity(b.id, apple.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("profile and roles", () => {
  it("updates the display name with validation", async () => {
    const u = await createUser(repos(), "Влатко");
    expect(
      (await repos().users.updateProfile(u.id, { displayName: "  Влатко   П. " })).displayName,
    ).toBe("Влатко П.");
    expect((await repos().users.updateProfile(u.id, {})).displayName).toBe("Влатко П.");
    await expect(repos().users.updateProfile(u.id, { displayName: " " })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      repos().users.updateProfile("00000000-0000-0000-0000-000000000000", { displayName: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("adds and removes roles, protecting the last role and active coaching", async () => {
    const coach = await createUser(repos(), "Тренер");
    const athlete = await createUser(repos(), "Спортист");
    expect(await repos().users.addRole(coach.id, "coach")).toEqual(["athlete", "coach"]);
    const link = await repos().coaching.invite(coach.id, athlete.id);
    await expect(repos().users.removeRole(coach.id, "coach")).rejects.toThrow(/coaching/);
    await repos().coaching.end(link.id);
    expect(await repos().users.removeRole(coach.id, "coach")).toEqual(["athlete"]);
    expect(await repos().users.removeRole(coach.id, "coach")).toEqual(["athlete"]);
    await expect(repos().users.removeRole(coach.id, "athlete")).rejects.toThrow(/at least one/);
  });

  it("deletes the account with all of its data", async () => {
    const u = await createUser(repos(), "Брише");
    await repos().sessions.create(u.id);
    await repos().settings.save(u.id, {
      ...(await repos().settings.get(u.id)),
      unitSystem: "imperial",
    });
    await repos().users.deleteAccount(u.id);
    await expect(repos().users.get(u.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await repos().sessions.listActive(u.id)).toEqual([]);
    const { rows } = await database().pool.query(
      "select count(*)::int as n from athlete_settings where user_id = $1",
      [u.id],
    );
    expect(rows[0].n).toBe(0);
    await expect(repos().users.deleteAccount(u.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("sessions and refresh tokens", () => {
  it("rotates refresh tokens and lists active sessions", async () => {
    const u = await createUser(repos());
    const first = await repos().sessions.create(u.id, "Mozilla/5.0 ".repeat(40));
    expect(first.refreshToken).toMatch(/^[\w-]{43}$/);
    const second = await repos().sessions.rotate(first.refreshToken);
    expect(second).toMatchObject({ sessionId: first.sessionId, userId: u.id });
    expect(second.refreshToken).not.toBe(first.refreshToken);
    const [listed] = await repos().sessions.listActive(u.id);
    expect(listed?.id).toBe(first.sessionId);
    expect(listed?.userAgent).toHaveLength(200);
    expect(await repos().sessions.isActive(first.sessionId)).toBe(true);
    await expect(repos().sessions.rotate("not-a-token")).rejects.toMatchObject({
      reason: "invalid",
    });
  });

  it("tolerates a parallel refresh within the grace window", async () => {
    const u = await createUser(repos());
    const s = await repos().sessions.create(u.id);
    const [a, b] = await Promise.all([
      repos().sessions.rotate(s.refreshToken),
      repos().sessions.rotate(s.refreshToken),
    ]);
    expect(a.refreshToken).not.toBe(b.refreshToken);
    expect(await repos().sessions.isActive(s.sessionId)).toBe(true);
  });

  it("revokes the session when a used refresh token comes back (theft detection)", async () => {
    const u = await createUser(repos());
    const strict = new SessionsRepository(database().db, {
      ...DEFAULT_SESSION_POLICY,
      reuseGraceSeconds: 0,
    });
    const s = await strict.create(u.id);
    const next = await strict.rotate(s.refreshToken);
    await expect(strict.rotate(s.refreshToken)).rejects.toMatchObject({ reason: "reused" });
    expect(await strict.isActive(s.sessionId)).toBe(false);
    // The legitimate holder of the newer token is signed out too.
    await expect(strict.rotate(next.refreshToken)).rejects.toMatchObject({ reason: "revoked" });
  });

  it("expires sessions and signs out one, others, or a token's session", async () => {
    const u = await createUser(repos());
    const other = await createUser(repos(), "Друг");
    const expiring = new SessionsRepository(database().db, {
      ...DEFAULT_SESSION_POLICY,
      sessionTtlSeconds: 0,
    });
    const dead = await expiring.create(u.id);
    await expect(expiring.rotate(dead.refreshToken)).rejects.toBeInstanceOf(AuthError);
    await expect(expiring.rotate(dead.refreshToken)).rejects.toMatchObject({ reason: "expired" });

    const s1 = await repos().sessions.create(u.id);
    const s2 = await repos().sessions.create(u.id);
    const s3 = await repos().sessions.create(u.id);
    await expect(repos().sessions.revoke(other.id, s1.sessionId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await repos().sessions.revoke(u.id, s1.sessionId);
    expect(await repos().sessions.revokeAll(u.id, s3.sessionId)).toBe(1);
    expect((await repos().sessions.listActive(u.id)).map((s) => s.id)).toEqual([s3.sessionId]);
    await repos().sessions.revokeByRefreshToken(s3.refreshToken);
    await repos().sessions.revokeByRefreshToken("unknown");
    expect(await repos().sessions.listActive(u.id)).toEqual([]);
    expect(await repos().sessions.isActive(s2.sessionId)).toBe(false);
    expect(await repos().sessions.revokeAll(u.id)).toBe(0);
  });

  it("purges refresh tokens long past expiry", async () => {
    const u = await createUser(repos());
    await repos().sessions.create(u.id);
    await database().pool.query("update refresh_tokens set expires_at = now() - interval '2 days'");
    expect(await repos().sessions.purgeExpiredTokens()).toBe(1);
  });
});

describe("magic-link tokens", () => {
  it("issues single-use tokens per purpose", async () => {
    const issued = await repos().loginTokens.issue(" Vlatko@Example.com ");
    expect(issued).toMatchObject({ email: "vlatko@example.com" });
    await expect(repos().loginTokens.consume(issued!.token, "link")).rejects.toBeInstanceOf(
      AuthError,
    );
    expect(await repos().loginTokens.consume(issued!.token, "sign_in")).toEqual({
      email: "vlatko@example.com",
      purpose: "sign_in",
      userId: null,
    });
    await expect(repos().loginTokens.consume(issued!.token, "sign_in")).rejects.toMatchObject({
      reason: "invalid",
    });
  });

  it("binds link tokens to a user and validates input", async () => {
    const u = await createUser(repos());
    const link = await repos().loginTokens.issue("new@example.com", "link", u.id);
    expect(await repos().loginTokens.consume(link!.token, "link")).toMatchObject({ userId: u.id });
    await expect(repos().loginTokens.issue("new@example.com", "link")).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(repos().loginTokens.issue("not-an-email")).rejects.toBeInstanceOf(ValidationError);
  });

  it("rate-limits per address and expires tokens", async () => {
    const limited = new LoginTokensRepository(database().db, { ttlSeconds: 0, maxPerHour: 2 });
    const t = await limited.issue("a@example.com");
    await limited.issue("A@example.com");
    expect(await limited.issue("a@example.com")).toBeNull();
    expect(await limited.issue("b@example.com")).not.toBeNull();
    await expect(limited.consume(t!.token, "sign_in")).rejects.toBeInstanceOf(AuthError);
    await database().pool.query("update login_tokens set created_at = now() - interval '2 days'");
    expect(await limited.purgeOld()).toBe(3);
  });
});
