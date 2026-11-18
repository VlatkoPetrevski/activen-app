import { createHash, randomBytes } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";
import { inject } from "vitest";
import type { IdTokenKeys } from "../src/auth/id-token.verifier.js";
import type { Mailer, OutgoingEmail } from "../src/auth/mailer.js";
import { loadConfig } from "../src/config.js";

export const GOOGLE_CLIENT = "web-client.apps.googleusercontent.com";
export const APPLE_CLIENT = "mk.activen.web";

export const testConfig = (overrides: Record<string, string> = {}) =>
  loadConfig({
    DATABASE_URL: inject("databaseUrl"),
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
    GOOGLE_CLIENT_IDS: GOOGLE_CLIENT,
    APPLE_CLIENT_IDS: APPLE_CLIENT,
    PUBLIC_WEB_URL: "https://app.activen.test",
    ...overrides,
  });

/** Stand-ins for Google's and Apple's signing keys. */
export async function fakeProviders() {
  const make = async (kid: string) => {
    const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
    return { kid, privateKey, jwk: { ...(await exportJWK(publicKey)), kid, alg: "RS256" } };
  };
  const google = await make("google-1");
  const apple = await make("apple-1");
  const keys: IdTokenKeys = {
    google: createLocalJWKSet({ keys: [google.jwk] }),
    apple: createLocalJWKSet({ keys: [apple.jwk] }),
  };
  const sign = async (
    key: { kid: string; privateKey: CryptoKey },
    claims: Record<string, unknown>,
    opts: { issuer: string; audience: string; expiresIn?: string },
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: key.kid })
      .setIssuer(opts.issuer)
      .setAudience(opts.audience)
      .setIssuedAt()
      .setExpirationTime(opts.expiresIn ?? "5m")
      .sign(key.privateKey);

  return {
    keys,
    googleToken: (
      claims: Record<string, unknown>,
      opts: Partial<{ issuer: string; audience: string; expiresIn: string }> = {},
    ) =>
      sign(google, claims, {
        issuer: "https://accounts.google.com",
        audience: GOOGLE_CLIENT,
        ...opts,
      }),
    appleToken: (
      claims: Record<string, unknown>,
      opts: Partial<{ issuer: string; audience: string }> = {},
    ) =>
      sign(apple, claims, { issuer: "https://appleid.apple.com", audience: APPLE_CLIENT, ...opts }),
  };
}

export const newNonce = () => randomBytes(16).toString("hex");
export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

/** Keeps sent emails so tests can follow the magic link. */
export class CapturingMailer implements Mailer {
  readonly sent: OutgoingEmail[] = [];
  async send(email: OutgoingEmail): Promise<void> {
    this.sent.push(email);
  }
  lastTokenFor(to: string): string {
    const mail = this.sent.filter((m) => m.to === to).at(-1);
    const match = mail?.text.match(/#token=([\w-]+)/);
    if (!match?.[1]) throw new Error(`no link sent to ${to}`);
    return match[1];
  }
}

export const cookieValue = (setCookie: string[] | string | undefined, name: string) => {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const line = list.find((c) => c.startsWith(`${name}=`));
  return line ? { value: line.split(";")[0]!.slice(name.length + 1), line } : undefined;
};
