import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./harness.js";

/**
 * Contract between the web client and this API: every request the web's HttpApi makes must be a
 * route the server publishes (method and path, from the OpenAPI document). A renamed or removed
 * endpoint then fails here, not in production.
 */
let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());

const HTTP_API = fileURLToPath(new URL("../../web/src/api/http.ts", import.meta.url));

/** `("GET", `/v1/me/plan/${id}`)` → "GET /v1/me/plan/{}" (query strings dropped). */
function clientRoutes(source: string): string[] {
  const calls = source.matchAll(
    /request(?:<[^>]*>)?\(\s*"(GET|POST|PUT|PATCH|DELETE)",\s*[`"](\/[^`"?]*)/g,
  );
  return [...new Set([...calls].map((m) => `${m[1]} ${m[2]!.replace(/\$\{[^}]+\}/g, "{}")}`))];
}

describe("web client ↔ API routes", () => {
  it("every route the web calls exists on the server", async () => {
    const doc = await h.http().get("/docs/openapi.json").expect(200);
    const server = new Set(
      Object.entries(doc.body.paths as Record<string, Record<string, unknown>>).flatMap(
        ([path, ops]) =>
          Object.keys(ops).map((m) => `${m.toUpperCase()} ${path.replace(/\{[^}]+\}/g, "{}")}`),
      ),
    );
    const client = clientRoutes(readFileSync(HTTP_API, "utf8"));
    expect(client.length).toBeGreaterThan(40);
    // A placeholder on either side matches one path segment (e.g. /v1/auth/{provider}).
    const matches = (a: string, b: string) => {
      const x = a.split(/[ /]/);
      const y = b.split(/[ /]/);
      return x.length === y.length && x.every((s, i) => s === y[i] || s === "{}" || y[i] === "{}");
    };
    expect(client.filter((r) => ![...server].some((s) => matches(r, s)))).toEqual([]);
  });
});
