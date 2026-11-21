import { describe, expect, it } from "vitest";
import { DemoApi } from "../src/api/demo.js";

const NOW = new Date("2026-11-19T07:00:00Z");
const make = () =>
  new DemoApi(
    () => "mk",
    () => NOW,
  );

describe("DemoApi as athlete", () => {
  it("serves a consistent training block with links, check-ins and wellness", async () => {
    const api = make();
    expect(await api.restoreSession()).toBe(false);
    await api.signInDemo("athlete");
    const me = await api.me();
    expect(me.user).toMatchObject({ displayName: "Влатко Петревски", roles: ["athlete"] });
    expect(await api.wellness("2026-11-19")).toMatchObject({ trainingReadiness: 72 });
    const cal = await api.calendar("2026-11-16", "2026-11-22");
    expect(cal.entries).toHaveLength(7);
    expect(cal.links.some((l) => l.activityId)).toBe(true);

    const acts = await api.activities("2026-10-01", "2026-11-19");
    const detail = await api.activity(acts[0]!.id);
    expect(detail.activity.id).toBe(acts[0]!.id);
    await api.saveFeedback(acts[0]!.id, { perceivedEffort: 4, feel: 4, comment: " ok " });
    expect((await api.activity(acts[0]!.id)).activity.feedback).toMatchObject({
      perceivedEffort: 4,
      comment: "ok",
    });
    await expect(api.activity("missing")).rejects.toMatchObject({ status: 404 });

    const progress = await api.progress(12);
    expect(progress.weeks).toHaveLength(12);
    expect(progress.last4Weeks.count).toBeGreaterThan(0);
  });

  it("edits the plan with version checks", async () => {
    const api = make();
    await api.signInDemo("athlete");
    const created = await api.createPlan({
      calendarDate: "2026-11-24",
      kind: "workout",
      description: " Темпо ",
    });
    expect(created).toMatchObject({ description: "Темпо", version: 1 });
    const updated = await api.updatePlan(created.id, {
      expectedVersion: 1,
      description: "Темпо 8 km",
    });
    expect(updated.version).toBe(2);
    await expect(api.updatePlan(created.id, { expectedVersion: 1 })).rejects.toMatchObject({
      status: 409,
    });
    await api.deletePlan(created.id);
    await expect(api.deletePlan(created.id)).rejects.toMatchObject({ status: 404 });
    await expect(api.updatePlan("nope", { expectedVersion: 1 })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("manages the coach relationship and the thread", async () => {
    const api = make();
    await api.signInDemo("athlete");
    const [coach] = await api.coaches();
    expect(coach).toMatchObject({ coachName: "Ана Стојанова", status: "active" });
    await api.updateCoachScopes(coach!.linkId, ["comments"]);
    expect((await api.coaches())[0]!.scopes).toEqual(["comments"]);
    await api.acceptCoach(coach!.linkId, ["activities"]);
    const before = (await api.comments()).length;
    await api.postComment({ body: "Здраво" });
    expect((await api.comments())[0]!.body).toBe("Здраво");
    expect((await api.comments()).length).toBe(before + 1);
    await api.endCoach(coach!.linkId);
    expect(await api.coaches()).toEqual([]);
    expect(await restoreAfterReload()).toBe(true);
  });

  it("covers profile operations", async () => {
    const api = make();
    await api.signInDemo("athlete");
    expect((await api.updateProfile(" Влатко ")).displayName).toBe("Влатко");
    expect((await api.updateSettings({ unitSystem: "imperial" })).unitSystem).toBe("imperial");
    expect(await api.sessions()).toHaveLength(1);
    await api.revokeSession();
    expect(await api.revokeOtherSessions()).toBe(0);
    await expect(api.unlinkIdentity()).rejects.toMatchObject({ status: 409 });
    await expect(api.startEmailSignIn("a@b.c", "mk")).rejects.toMatchObject({ status: 501 });
    await expect(api.verifyEmailSignIn("t")).rejects.toMatchObject({ status: 501 });
    await expect(api.signInWithIdToken("google", "t", "n")).rejects.toMatchObject({ status: 501 });
    await expect(api.startEmailLink("a@b.c", "mk")).rejects.toMatchObject({ status: 501 });
    await expect(api.verifyEmailLink("t")).rejects.toMatchObject({ status: 501 });
    expect(await api.addRole("coach")).toEqual(["athlete", "coach"]);
    expect(await api.removeRole("coach")).toEqual(["athlete"]);
    expect(await api.providers()).toEqual({ google: false, apple: false, email: false });
    await api.deleteAccount();
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
  });
});

async function restoreAfterReload() {
  const again = make();
  return again.restoreSession();
}

describe("DemoApi as coach", () => {
  it("lists athletes with signals, respects consent and plans for athletes", async () => {
    const api = make();
    await api.signInDemo("coach");
    expect((await api.me()).user.roles).toEqual(["athlete", "coach"]);
    const rows = await api.coachAthletes();
    expect(rows).toHaveLength(7);
    expect(rows[0]!.signals.length).toBeGreaterThan(0);
    const vlatko = rows.find((r) => r.athleteId === "demo-vlatko")!;
    expect(vlatko.signals.map((s) => s.code)).toContain("awaiting_reply");
    const marija = rows.find((r) => r.athleteId === "demo-marija")!;
    expect(marija.lastActivity).toBeNull();
    await expect(api.athleteProgress("demo-marija", 8)).rejects.toMatchObject({ status: 403 });
    expect(
      (await api.athleteCalendar("demo-marija", "2026-11-16", "2026-11-22")).activitiesVisible,
    ).toBe(false);
    expect((await api.athleteProgress("demo-vlatko", 8)).weeks).toHaveLength(8);
    await expect(
      api.athleteCalendar("demo-nikola", "2026-11-16", "2026-11-22"),
    ).rejects.toMatchObject({ status: 404 });

    const entry = await api.createAthletePlan("demo-vlatko", {
      calendarDate: "2026-11-25",
      kind: "workout",
      description: "Темпо",
      notes: "Држи 165",
    });
    await api.updateAthletePlan("demo-vlatko", entry.id, { expectedVersion: 1, notes: "Држи 160" });
    await api.deleteAthletePlan("demo-vlatko", entry.id);
    const reply = await api.postAthleteComment("demo-vlatko", { body: "Утре лесно." });
    expect(reply.authorName).toBe("Ана Стојанова");
    expect((await api.athleteComments("demo-vlatko"))[0]!.id).toBe(reply.id);
    expect(
      (await api.coachAthletes())
        .find((r) => r.athleteId === "demo-vlatko")!
        .signals.map((s) => s.code),
    ).not.toContain("awaiting_reply");

    await api.inviteAthlete("nova@example.com");
    expect(
      (await api.coachAthletes()).some((r) => r.displayName === "nova" && r.status === "invited"),
    ).toBe(true);
    await api.endAthlete("demo-petar");
    await expect(api.endAthlete("demo-petar")).rejects.toMatchObject({ status: 404 });
    expect(await api.coaches()).toEqual([]);
    expect(await api.wellness("2026-11-19")).not.toBeNull();
    expect(api.todayDate).toBe("2026-11-19");
    expect(api.relative(-1)).toBe("2026-11-18");
  });

  it("uses English names in English", async () => {
    const api = new DemoApi(
      () => "en",
      () => NOW,
    );
    await api.signInDemo("coach");
    expect((await api.me()).user.displayName).toBe("Ana Stojanova");
    expect((await api.coachAthletes()).map((r) => r.displayName)).toContain("Vlatko Petrevski");
    await api.signOut();
    expect(await api.restoreSession()).toBe(false);
  });
});
