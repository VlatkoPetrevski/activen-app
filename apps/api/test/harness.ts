import { randomUUID } from "node:crypto";
import type { ConsentScope, Repositories, SourceActivityInput } from "@activen/db";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { expect } from "vitest";
import { createApp, type AppOverrides } from "../src/app.js";
import { REPOSITORIES } from "../src/tokens.js";
import { CapturingMailer, testConfig } from "./auth-helpers.js";

/**
 * Shared integration harness: a real Nest app on the per-run test database, users signed in
 * through the real magic-link flow, and helpers that build common situations (a coach with an
 * athlete and given consents). Every helper uses fresh, random emails, so test files and test
 * cases never depend on each other's data.
 */
export interface Harness {
  app: INestApplication;
  repos: Repositories;
  mailer: CapturingMailer;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export interface TestUser {
  id: string;
  email: string;
  auth: { Authorization: string };
}

export async function startHarness(overrides: Partial<AppOverrides> = {}): Promise<Harness> {
  const mailer = new CapturingMailer();
  const app = await createApp(testConfig(), { mailer, ...overrides });
  await app.init();
  return {
    app,
    repos: app.get(REPOSITORIES),
    mailer,
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}

export const uniqueEmail = (label = "user") => `${label}-${randomUUID().slice(0, 8)}@example.com`;

export async function signIn(h: Harness, email = uniqueEmail()): Promise<TestUser> {
  await h.http().post("/v1/auth/email/start").send({ email }).expect(202);
  const res = await h
    .http()
    .post("/v1/auth/email/verify")
    .send({ token: h.mailer.lastTokenFor(email), client: "native" })
    .expect(200);
  return {
    id: res.body.user.id as string,
    email,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
  };
}

export async function signInCoach(h: Harness): Promise<TestUser> {
  const coach = await signIn(h, uniqueEmail("coach"));
  await h.http().put("/v1/me/roles/coach").set(coach.auth).expect(200);
  return coach;
}

/** Coach invites the athlete; the athlete accepts with the given scopes. Returns the link id. */
export async function link(
  h: Harness,
  coach: TestUser,
  athlete: TestUser,
  scopes: readonly ConsentScope[] | "invite-only",
): Promise<string> {
  await h
    .http()
    .post("/v1/coach/invites")
    .set(coach.auth)
    .send({ email: athlete.email })
    .expect(202);
  const invites = await h.http().get("/v1/me/coaches").set(athlete.auth).expect(200);
  const invite = (invites.body as { linkId: string; coachId: string }[]).find(
    (l) => l.coachId === coach.id,
  );
  expect(invite).toBeDefined();
  if (scopes !== "invite-only")
    await h
      .http()
      .post(`/v1/me/coaches/${invite!.linkId}/accept`)
      .set(athlete.auth)
      .send({ scopes })
      .expect(204);
  return invite!.linkId;
}

/** A plain completed run for the athlete on the given day (defaults: Garmin, 10 km). */
export async function addActivity(
  h: Harness,
  userId: string,
  calendarDate: string,
  overrides: Partial<SourceActivityInput> = {},
) {
  const { activity } = await h.repos.activities.upsert({
    userId,
    vendor: "garmin",
    externalId: randomUUID(),
    activityName: "Run",
    activityType: "RUNNING",
    calendarDate,
    startTimeInSeconds: Math.floor(Date.parse(`${calendarDate}T07:00:00Z`) / 1000),
    startTimeOffsetInSeconds: 3600,
    distanceInMeters: 10_000,
    durationInSeconds: 3000,
    movingDurationInSeconds: 2950,
    totalElevationGainInMeters: 50,
    trainingLoad: 80,
    averageHeartRateInBeatsPerMinute: 145,
    maxHeartRateInBeatsPerMinute: 170,
    averagePowerInWatts: null,
    activeKilocalories: 600,
    gearName: null,
    isRace: false,
    ...overrides,
  });
  return activity;
}

export const planBody = (calendarDate: string, overrides: Record<string, unknown> = {}) => ({
  calendarDate,
  kind: "workout",
  plannedActivityType: "RUNNING",
  description: "Easy 8 km",
  plannedDistanceInMeters: 8000,
  ...overrides,
});
