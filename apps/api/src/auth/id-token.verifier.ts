import { AuthError } from "@activen/db";
import { NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

export type IdProvider = "google" | "apple";

/** Signing keys of the identity providers (replaceable in tests). */
export type IdTokenKeys = Record<IdProvider, JWTVerifyGetKey>;

export function remoteIdTokenKeys(): IdTokenKeys {
  return {
    google: createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs")),
    apple: createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys")),
  };
}

const ISSUERS: Record<IdProvider, string[]> = {
  google: ["https://accounts.google.com", "accounts.google.com"],
  apple: ["https://appleid.apple.com"],
};

export interface VerifiedIdentity {
  subject: string;
  /** Present only when the provider marks it verified. */
  email: string | null;
  name: string | null;
}

const sha256Hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * Verifies OpenID Connect ID tokens obtained by the client (Google Identity Services, Sign in with
 * Apple): signature against the provider's keys, issuer, audience (our client IDs), expiry and the
 * nonce the client generated for this sign-in (replay protection).
 */
export class IdTokenVerifier {
  constructor(
    private readonly keys: IdTokenKeys,
    private readonly audiences: Record<IdProvider, string[]>,
  ) {}

  enabled(provider: IdProvider): boolean {
    return this.audiences[provider].length > 0;
  }

  async verify(provider: IdProvider, idToken: string, nonce: string): Promise<VerifiedIdentity> {
    if (!this.enabled(provider))
      throw new NotFoundException(`Sign-in with ${provider} is not enabled`);
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, this.keys[provider], {
        issuer: ISSUERS[provider],
        audience: this.audiences[provider],
        algorithms: ["RS256"],
        clockTolerance: 30,
      }));
    } catch {
      throw new AuthError("invalid");
    }
    // Apple (native) carries the SHA-256 of the client's nonce; Google carries it as sent.
    if (typeof payload.nonce !== "string" || ![nonce, sha256Hex(nonce)].includes(payload.nonce))
      throw new AuthError("invalid");
    if (typeof payload.sub !== "string" || payload.sub.length === 0) throw new AuthError("invalid");
    const verified = payload.email_verified === true || payload.email_verified === "true";
    return {
      subject: payload.sub,
      email: verified && typeof payload.email === "string" ? payload.email : null,
      name: typeof payload.name === "string" ? payload.name : null,
    };
  }
}
