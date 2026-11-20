import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { AnthropicWorkoutAi, structureWorkout } from "../src/workouts/structurer.js";
import { CapturingMailer, testConfig } from "./auth-helpers.js";

let app: INestApplication;
const mailer = new CapturingMailer();
const http = () => request(app.getHttpServer());
const aiStructure = vi.fn(async (text: string) =>
  text.includes("пирамида")
    ? {
        source: "ai" as const,
        items: [
          {
            kind: "step" as const,
            intensity: "active" as const,
            duration: { type: "time" as const, seconds: 60 },
            target: { type: "none" as const },
          },
        ],
      }
    : null,
);

beforeAll(async () => {
  app = await createApp(testConfig(), { mailer, workoutAi: { structure: aiStructure } });
  await app.init();
});
afterAll(() => app.close());

async function signIn(email: string) {
  await http().post("/v1/auth/email/start").send({ email }).expect(202);
  const res = await http()
    .post("/v1/auth/email/verify")
    .send({ token: mailer.lastTokenFor(email), client: "native" })
    .expect(200);
  return { Authorization: `Bearer ${res.body.accessToken}` };
}

describe("workout structuring", () => {
  it("uses the parser first, the AI for the rest, and saves an accepted structure", async () => {
    const auth = await signIn("struct@example.com");
    const parsed = await http()
      .post("/v1/workouts/structure")
      .set(auth)
      .send({ text: "14 km со 6 × 1000 м на 5K темпо" })
      .expect(200);
    expect(parsed.body.structure.source).toBe("parser");
    expect(parsed.body.structure.items[1]).toMatchObject({ kind: "repeat", count: 6 });
    expect(aiStructure).not.toHaveBeenCalled();

    const ai = await http()
      .post("/v1/workouts/structure")
      .set(auth)
      .send({ text: "пирамида по чувство", locale: "mk" })
      .expect(200);
    expect(ai.body.structure.source).toBe("ai");
    expect(aiStructure).toHaveBeenCalledWith("пирамида по чувство", "mk");

    const free = await http()
      .post("/v1/workouts/structure")
      .set(auth)
      .send({ text: "слободно" })
      .expect(200);
    expect(free.body).toEqual({ structure: null });
    await http().post("/v1/workouts/structure").set(auth).send({ text: "" }).expect(422);
    await http().post("/v1/workouts/structure").send({ text: "10 km" }).expect(401);

    const created = await http()
      .post("/v1/me/plan")
      .set(auth)
      .send({
        calendarDate: "2026-11-24",
        kind: "workout",
        description: "14 km со 6 × 1000 м на 5K темпо",
        structure: parsed.body.structure,
      })
      .expect(201);
    expect(created.body.structure).toEqual(parsed.body.structure);
    // Invalid structures are rejected at the edge.
    await http()
      .post("/v1/me/plan")
      .set(auth)
      .send({
        calendarDate: "2026-11-25",
        kind: "workout",
        description: "x",
        structure: { source: "ai", items: [{ kind: "repeat", count: 500, steps: [] }] },
      })
      .expect(422);
    const cleared = await http()
      .patch(`/v1/me/plan/${created.body.id}`)
      .set(auth)
      .send({ structure: null, expectedVersion: 1 })
      .expect(200);
    expect(cleared.body.structure).toBeNull();
  });
});

describe("AnthropicWorkoutAi", () => {
  const reply = (text: string, ok = true) =>
    vi.fn(
      async () =>
        new Response(JSON.stringify({ content: [{ type: "text", text }] }), {
          status: ok ? 200 : 500,
        }),
    );

  it("sends only the text and validates the answer", async () => {
    const fetchImpl = reply(
      'Ево: {"items":[{"kind":"step","intensity":"active","duration":{"type":"time","seconds":600},"target":{"type":"hr_zone","zone":2}}]}',
    );
    const ai = new AnthropicWorkoutAi("key", "model-x", fetchImpl as unknown as typeof fetch);
    const s = await ai.structure("10 мин лесно по чувство", "mk");
    expect(s).toEqual({
      source: "ai",
      items: [
        {
          kind: "step",
          intensity: "active",
          duration: { type: "time", seconds: 600 },
          target: { type: "hr_zone", zone: 2 },
        },
      ],
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("model-x");
    expect(body.messages[0].content).toContain("10 мин лесно по чувство");
  });

  it("returns null for errors, empty or invalid answers", async () => {
    const cases = [
      reply("", false),
      reply("no json here"),
      reply('{"items":[]}'),
      reply('{"items":[{"kind":"step","intensity":"sprint"}]}'),
      reply("{not json}"),
    ];
    for (const f of cases)
      expect(
        await new AnthropicWorkoutAi("k", "m", f as unknown as typeof fetch).structure("x", "en"),
      ).toBeNull();
    const broken = { structure: vi.fn(async () => Promise.reject(new Error("down"))) };
    expect(await structureWorkout("слободно", "mk", broken)).toBeNull();
    expect(await structureWorkout("слободно", "mk", null)).toBeNull();
  });
});
