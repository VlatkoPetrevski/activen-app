import { describe, expect, it } from "vitest";
import { seedDemoData } from "../src/demo-seed.js";
import { NotFoundError, ValidationError } from "../src/errors.js";
import { createUser, useDatabase } from "./helpers.js";

const { repos } = useDatabase();

describe("demo seed", () => {
  it("loads a training block once and is safe to run again", async () => {
    const u = await createUser(repos());
    const first = await seedDemoData(repos(), u.id, { today: "2026-11-19" });
    expect(first.activities).toBeGreaterThan(30);
    expect(first.planEntries).toBe(77);
    expect(first.feedback).toBeGreaterThan(10);
    const again = await seedDemoData(repos(), u.id, { today: "2026-11-19", locale: "en" });
    expect(again.planEntries).toBe(0);
    const acts = await repos().activities.listByDateRange(u.id, "2026-09-01", "2026-12-31");
    expect(acts).toHaveLength(first.activities);

    const one = acts[0]!;
    expect(await repos().activities.get(u.id, one.id)).toEqual(one);
    const other = await createUser(repos(), "Друг");
    await expect(repos().activities.get(other.id, one.id)).rejects.toBeInstanceOf(NotFoundError);

    const fb = await repos().feedback.forActivities(acts.map((a) => a.id));
    expect(fb.size).toBe(first.feedback);
    expect((await repos().feedback.forActivities([])).size).toBe(0);

    const [entry] = await repos().plans.listByDateRange(u.id, "2026-11-17", "2026-11-17");
    expect(await repos().plans.get(entry!.id)).toEqual(entry);
    await repos().plans.remove(entry!.id);
    await expect(repos().plans.get(entry!.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("users lookups", () => {
  it("finds accounts by email and names by id", async () => {
    const a = await createUser(repos(), "Ана");
    expect(await repos().users.findIdByEmail(` ${a.email!.toUpperCase()} `)).toBe(a.id);
    expect(await repos().users.findIdByEmail("nobody@example.com")).toBeNull();
    expect(await repos().users.displayNames([a.id])).toEqual(new Map([[a.id, "Ана"]]));
    expect((await repos().users.displayNames([])).size).toBe(0);
  });
});

describe("coach links", () => {
  it("lists open links for both sides", async () => {
    const coach = await createUser(repos(), "Тренер", ["coach"]);
    const athlete = await createUser(repos(), "Спортист");
    const link = await repos().coaching.invite(coach.id, athlete.id);
    expect(await repos().coaching.linksOfAthlete(athlete.id)).toEqual([link]);
    expect(await repos().coaching.linksOfCoach(coach.id)).toEqual([link]);
    expect(await repos().coaching.activeLink(coach.id, athlete.id)).toBeNull();
    await repos().coaching.accept(link.id, athlete.id, ["activities"]);
    expect(await repos().coaching.activeLink(coach.id, athlete.id)).toMatchObject({
      status: "active",
    });
    expect(await repos().coaching.get(link.id)).toMatchObject({ status: "active" });
    await repos().coaching.end(link.id);
    expect(await repos().coaching.linksOfAthlete(athlete.id)).toEqual([]);
    await expect(
      repos().coaching.get("00000000-0000-0000-0000-000000000000"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("comments", () => {
  it("keeps the athlete thread newest first with paging and latest per athlete", async () => {
    const coach = await createUser(repos(), "Тренер", ["coach"]);
    const a = await createUser(repos(), "А");
    const b = await createUser(repos(), "Б");
    const c1 = await repos().comments.add(a.id, a.id, { body: " Нозете тешки. " });
    await new Promise((r) => setTimeout(r, 5));
    const c2 = await repos().comments.add(a.id, coach.id, { body: "Утре лесно.", language: "mk" });
    await repos().comments.add(b.id, coach.id, { body: "Браво!" });
    expect(c1.body).toBe("Нозете тешки.");
    expect((await repos().comments.list(a.id)).map((c) => c.id)).toEqual([c2.id, c1.id]);
    expect((await repos().comments.list(a.id, { before: c2.createdAt })).map((c) => c.id)).toEqual([
      c1.id,
    ]);
    expect(
      await repos().comments.list(a.id, { activityId: "00000000-0000-0000-0000-000000000000" }),
    ).toEqual([]);
    const latest = await repos().comments.latestFor([a.id, b.id]);
    expect(latest.get(a.id)?.id).toBe(c2.id);
    expect(latest.get(b.id)?.body).toBe("Браво!");
    expect((await repos().comments.latestFor([])).size).toBe(0);
    await expect(repos().comments.add(a.id, a.id, { body: "  " })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
