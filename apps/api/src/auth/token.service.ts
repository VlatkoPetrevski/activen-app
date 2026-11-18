import { AuthError } from "@activen/db";
import {
  calculateJwkThumbprint,
  errors,
  exportJWK,
  generateKeyPair,
  importJWK,
  jwtVerify,
  SignJWT,
  type CryptoKey,
  type JWK,
} from "jose";
import type { AppConfig } from "../config.js";

const ALG = "EdDSA";
const AUDIENCE = "activen-api";

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

/**
 * Short-lived access tokens (JWT, Ed25519). Clients send them as `Authorization: Bearer`; the
 * session behind them is checked on every request, so signing out takes effect immediately.
 */
export class TokenService {
  private constructor(
    private readonly privateKey: CryptoKey,
    private readonly publicKey: CryptoKey,
    private readonly publicJwk: JWK & { kid: string },
    private readonly issuer: string,
    readonly ttlSeconds: number,
  ) {}

  static async create(
    config: Pick<AppConfig, "AUTH_SIGNING_KEY" | "AUTH_ISSUER" | "ACCESS_TOKEN_TTL_SECONDS">,
  ): Promise<TokenService> {
    let privateJwk: JWK;
    if (config.AUTH_SIGNING_KEY) {
      privateJwk = JSON.parse(config.AUTH_SIGNING_KEY) as JWK;
      if (privateJwk.kty !== "OKP" || privateJwk.crv !== "Ed25519" || !privateJwk.d)
        throw new Error("AUTH_SIGNING_KEY must be an Ed25519 private JWK");
    } else {
      const pair = await generateKeyPair(ALG, { crv: "Ed25519", extractable: true });
      privateJwk = await exportJWK(pair.privateKey);
    }
    const { d: _d, ...publicPart } = privateJwk;
    const kid = privateJwk.kid ?? (await calculateJwkThumbprint(publicPart));
    const publicJwk = {
      kty: publicPart.kty,
      crv: publicPart.crv,
      x: publicPart.x,
      kid,
      alg: ALG,
      use: "sig",
    } as JWK & { kid: string };
    return new TokenService(
      (await importJWK({ ...privateJwk, kid }, ALG)) as CryptoKey,
      (await importJWK(publicJwk, ALG)) as CryptoKey,
      publicJwk,
      config.AUTH_ISSUER,
      config.ACCESS_TOKEN_TTL_SECONDS,
    );
  }

  async issue(claims: AccessClaims): Promise<string> {
    return new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: ALG, kid: this.publicJwk.kid, typ: "at+jwt" })
      .setSubject(claims.userId)
      .setIssuer(this.issuer)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.ttlSeconds}s`)
      .sign(this.privateKey);
  }

  async verify(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        issuer: this.issuer,
        audience: AUDIENCE,
        algorithms: [ALG],
        typ: "at+jwt",
      });
      if (typeof payload.sub !== "string" || typeof payload.sid !== "string")
        throw new AuthError("invalid");
      return { userId: payload.sub, sessionId: payload.sid };
    } catch (e) {
      if (e instanceof errors.JWTExpired) throw new AuthError("expired");
      if (e instanceof AuthError) throw e;
      throw new AuthError("invalid");
    }
  }

  /** Public keys for other services that verify ActiveN access tokens. */
  jwks(): { keys: JWK[] } {
    return { keys: [this.publicJwk] };
  }
}
