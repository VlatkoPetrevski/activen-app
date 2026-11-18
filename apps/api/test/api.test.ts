import { ConflictError, NotFoundError, ValidationError } from "@activen/db";
import {
  BadRequestException,
  HttpException,
  type ArgumentsHost,
  type INestApplication,
} from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { ConfigError, loadConfig } from "../src/config.js";
import { ProblemFilter } from "../src/problem.filter.js";

const config = (overrides: Record<string, string> = {}) =>
  loadConfig({
    DATABASE_URL: inject("databaseUrl"),
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
    ...overrides,
  });

describe("configuration", () => {
  it("applies defaults and parses CORS origins", () => {
    const c = config({ CORS_ORIGINS: "https://app.activen.mk, http://localhost:5173 ," });
    expect(c).toMatchObject({ PORT: 3000, DATABASE_POOL_MAX: 10, NODE_ENV: "test" });
    expect(c.CORS_ORIGINS).toEqual(["https://app.activen.mk", "http://localhost:5173"]);
  });

  it("refuses to start with invalid configuration", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    try {
      loadConfig({ DATABASE_URL: "mysql://x", PORT: "70000" });
    } catch (e) {
      expect((e as ConfigError).issues.join("\n")).toMatch(
        /DATABASE_URL[\s\S]*PORT|PORT[\s\S]*DATABASE_URL/,
      );
    }
  });
});

describe("HTTP API", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp(config());
    await app.init();
  });
  afterAll(() => app.close());

  it("reports liveness and readiness, with a request id", async () => {
    const live = await request(app.getHttpServer()).get("/health/live").expect(200);
    expect(live.body).toEqual({ status: "ok" });
    expect(live.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    const ready = await request(app.getHttpServer())
      .get("/health/ready")
      .set("x-request-id", "trace-123")
      .expect(200);
    expect(ready.body).toEqual({ status: "ok", checks: { database: "ok" } });
    expect(ready.headers["x-request-id"]).toBe("trace-123");
  });

  it("serves supported locales", async () => {
    const res = await request(app.getHttpServer()).get("/v1/reference/locales").expect(200);
    expect(res.body).toEqual({ locales: ["mk", "en"], default: "mk" });
  });

  it("localizes activity types by query, header, or default", async () => {
    const en = await request(app.getHttpServer())
      .get("/v1/reference/activity-types?locale=en")
      .expect(200);
    expect(en.body.locale).toBe("en");
    expect(en.body.items).toContainEqual({
      code: "TREADMILL_RUNNING",
      group: "running",
      name: "Treadmill",
      groupName: "Running",
      garminName: "Treadmill",
    });
    const header = await request(app.getHttpServer())
      .get("/v1/reference/activity-types")
      .set("Accept-Language", "de-DE, en;q=0.5")
      .expect(200);
    expect(header.body.locale).toBe("en");
    const mk = await request(app.getHttpServer()).get("/v1/reference/activity-types").expect(200);
    expect(mk.body.locale).toBe("mk");
    expect(mk.body.items.find((i: { code: string }) => i.code === "TRAIL_RUNNING")).toMatchObject({
      name: "Трејл трчање",
      groupName: "Трчање",
      garminName: "Trail Run",
    });
  });

  it("answers unknown routes with problem details", async () => {
    const res = await request(app.getHttpServer()).get("/v1/nope").expect(404);
    expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 404, title: "NOT FOUND", instance: "/v1/nope" });
  });

  it("publishes an OpenAPI document", async () => {
    const res = await request(app.getHttpServer()).get("/docs/openapi.json").expect(200);
    expect(res.body.info.title).toBe("ActiveN API");
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(["/health/live", "/health/ready", "/v1/reference/activity-types"]),
    );
  });

  it("allows the configured web origin (CORS)", async () => {
    const res = await request(app.getHttpServer())
      .options("/v1/reference/locales")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "GET");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });
});

describe("readiness without a database", () => {
  it("returns 503 when PostgreSQL is unreachable", async () => {
    const app = await createApp(config({ DATABASE_URL: "postgres://postgres@127.0.0.1:1/none" }));
    await app.init();
    const res = await request(app.getHttpServer()).get("/health/ready").expect(503);
    expect(res.body).toEqual({ status: "unavailable", checks: { database: "down" } });
    await request(app.getHttpServer()).get("/health/live").expect(200);
    await app.close();
  });
});

describe("problem filter", () => {
  const run = (exception: unknown) => {
    const json = vi.fn();
    const res = { status: vi.fn().mockReturnThis(), type: vi.fn().mockReturnThis(), json };
    const host = {
      switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ originalUrl: "/x" }) }),
    } as unknown as ArgumentsHost;
    new ProblemFilter().catch(exception, host);
    return { status: res.status.mock.calls[0]?.[0] as number, body: json.mock.calls[0]?.[0] };
  };

  it("maps repository errors to HTTP statuses", () => {
    expect(run(new NotFoundError("user", "1"))).toMatchObject({
      status: 404,
      body: { title: "Not Found" },
    });
    expect(run(new ConflictError("changed"))).toMatchObject({
      status: 409,
      body: { detail: "changed" },
    });
    expect(run(new ValidationError("bad", [{ field: "x" }]))).toMatchObject({
      status: 422,
      body: { errors: [{ field: "x" }] },
    });
  });

  it("keeps HTTP exceptions and hides internal errors", () => {
    expect(run(new BadRequestException(["a", "b"]))).toMatchObject({
      status: 400,
      body: { detail: "a; b" },
    });
    expect(run(new HttpException("plain", 418))).toMatchObject({
      status: 418,
      body: { detail: "plain" },
    });
    expect(run(new HttpException({ other: true }, 400)).body.detail).toBeUndefined();
    const internal = run(new Error("db password is hunter2"));
    expect(internal).toMatchObject({ status: 500, body: { detail: "Unexpected error" } });
    expect(JSON.stringify(internal.body)).not.toContain("hunter2");
    expect(run("weird").status).toBe(500);
  });
});
