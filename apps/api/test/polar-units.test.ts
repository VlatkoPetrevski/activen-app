import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PolarClient, PolarError } from "../src/connections/polar.client.js";
import { TokenCipher } from "../src/connections/token-cipher.js";

const key = () => randomBytes(32).toString("base64");

describe("token cipher", () => {
  it("encrypts with a fresh IV each time and refuses another key or a broken value", () => {
    const cipher = new TokenCipher(key());
    const a = cipher.encrypt("secret");
    const b = cipher.encrypt("secret");
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    expect(cipher.decrypt(a)).toBe("secret");
    expect(() => new TokenCipher(key()).decrypt(a)).toThrow();
    const tampered = new Uint8Array(a);
    tampered[tampered.length - 1]! ^= 1;
    expect(() => cipher.decrypt(tampered)).toThrow();
    expect(() => cipher.decrypt(new Uint8Array([2, 0, 0]))).toThrow(/Unknown token format/);
    expect(() => new TokenCipher("c2hvcnQ=")).toThrow(/32 bytes/);
  });

  it("signs OAuth state for one user and a limited time", () => {
    const cipher = new TokenCipher(key());
    const now = Date.now();
    const state = cipher.signState("user-1", 600, now);
    expect(cipher.verifyState(state, now + 1000)).toBe("user-1");
    expect(cipher.verifyState(state, now + 601_000)).toBeNull();
    expect(new TokenCipher(key()).verifyState(state, now)).toBeNull();
    expect(cipher.verifyState("garbage", now)).toBeNull();
    expect(cipher.verifyState("a.b.c", now)).toBeNull();
    const [payload] = state.split(".");
    const forged = `${Buffer.from('{"u":"admin","e":9999999999}').toString("base64url")}.${state.split(".")[1]}`;
    expect(cipher.verifyState(forged, now)).toBeNull();
    expect(payload).toBeTruthy();
  });
});

describe("Polar client", () => {
  const reply = (status: number, body: unknown = {}) =>
    (async () =>
      new Response(status === 204 ? null : JSON.stringify(body), { status })) as typeof fetch;

  it("reports Polar's refusals with their status", async () => {
    await expect(
      new PolarClient("i", "s", reply(403)).registerUser("t", "m"),
    ).rejects.toMatchObject({
      status: 403,
      message: "Mandatory consents missing in Polar Flow",
    });
    await expect(
      new PolarClient("i", "s", reply(500)).registerUser("t", "m"),
    ).rejects.toBeInstanceOf(PolarError);
    await expect(
      new PolarClient("i", "s", reply(409)).registerUser("t", "m"),
    ).resolves.toBeUndefined();
    await expect(
      new PolarClient("i", "s", reply(404)).deleteUser("t", "1"),
    ).resolves.toBeUndefined();
    await expect(new PolarClient("i", "s", reply(500)).deleteUser("t", "1")).rejects.toMatchObject({
      status: 500,
    });
    await expect(new PolarClient("i", "s", reply(404)).exerciseFit("t", "x")).rejects.toMatchObject(
      { status: 404 },
    );
    expect(await new PolarClient("i", "s", reply(204)).listExercises("t")).toEqual([]);
    expect(await new PolarClient("i", "s", reply(200, { nope: 1 })).listExercises("t")).toEqual([]);
    expect(
      await new PolarClient("i", "s", reply(200, [{ id: "a" }, { id: 7 }])).listExercises("t"),
    ).toEqual([{ id: "a" }]);
    await expect(
      new PolarClient("i", "s", reply(200, { token_type: "bearer" })).exchangeCode("c", "r"),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("sends client credentials only to the token endpoint", async () => {
    const seen: [string, RequestInit | undefined][] = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push([String(url), init]);
      return new Response(JSON.stringify({ access_token: "a", x_user_id: 5 }), { status: 200 });
    }) as typeof fetch;
    const client = new PolarClient("id", "sec", fetchFn);
    expect(await client.exchangeCode("c", "https://x/cb")).toEqual({
      accessToken: "a",
      polarUserId: "5",
      expiresIn: null,
    });
    const auth = (seen[0]![1]!.headers as Record<string, string>).Authorization;
    expect(auth).toBe(`Basic ${Buffer.from("id:sec").toString("base64")}`);
    await client.listExercises("user-token");
    expect((seen[1]![1]!.headers as Record<string, string>).Authorization).toBe(
      "Bearer user-token",
    );
  });
});
