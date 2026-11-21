import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Field-level encryption for vendor access tokens (AES-256-GCM): a database leak alone never
 * reveals them. Layout: version (1) | iv (12) | tag (16) | ciphertext. The key also signs
 * OAuth `state` values, so a callback cannot be forged or replayed for another user.
 */
export class TokenCipher {
  private readonly key: Buffer;

  constructor(keyBase64: string) {
    this.key = Buffer.from(keyBase64, "base64");
    if (this.key.length !== 32) throw new Error("ACTIVEN_TOKEN_KEY must be 32 bytes (base64)");
  }

  encrypt(plain: string): Uint8Array {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return new Uint8Array(Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), data]));
  }

  decrypt(sealed: Uint8Array): string {
    const buf = Buffer.from(sealed);
    if (buf[0] !== 1 || buf.length < 29) throw new Error("Unknown token format");
    const decipher = createDecipheriv("aes-256-gcm", this.key, buf.subarray(1, 13));
    decipher.setAuthTag(buf.subarray(13, 29));
    return Buffer.concat([decipher.update(buf.subarray(29)), decipher.final()]).toString("utf8");
  }

  /** `payload.signature`, valid for `ttlSeconds`. */
  signState(userId: string, ttlSeconds = 600, now = Date.now()): string {
    const payload = Buffer.from(
      JSON.stringify({
        u: userId,
        e: Math.floor(now / 1000) + ttlSeconds,
        n: randomBytes(8).toString("hex"),
      }),
    ).toString("base64url");
    return `${payload}.${this.mac(payload)}`;
  }

  /** The user id of a valid, unexpired state; null otherwise. */
  verifyState(state: string, now = Date.now()): string | null {
    const [payload, sig] = state.split(".");
    if (!payload || !sig) return null;
    const expected = Buffer.from(this.mac(payload));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      const { u, e } = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
        u: string;
        e: number;
      };
      return typeof u === "string" && e * 1000 > now ? u : null;
    } catch {
      return null;
    }
  }

  private mac(payload: string): string {
    return createHmac("sha256", this.key).update(`state:${payload}`).digest("base64url");
  }
}
