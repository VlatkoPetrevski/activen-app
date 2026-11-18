import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { AuthError, ValidationError } from "../errors.js";
import { loginTokens } from "../schema.js";
import { hashToken, newToken, normalizeEmail } from "./tokens.js";

export type LoginTokenPurpose = "sign_in" | "link";

export interface LoginTokenPolicy {
  ttlSeconds: number;
  /** Maximum links sent to one address per hour (protects the inbox and our sender reputation). */
  maxPerHour: number;
}

export const DEFAULT_LOGIN_TOKEN_POLICY: LoginTokenPolicy = { ttlSeconds: 15 * 60, maxPerHour: 5 };

export interface ConsumedLoginToken {
  email: string;
  purpose: LoginTokenPurpose;
  userId: string | null;
}

// Pragmatic check; deliverability is what really proves the address.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class LoginTokensRepository {
  constructor(
    private readonly db: Db,
    private readonly policy: LoginTokenPolicy = DEFAULT_LOGIN_TOKEN_POLICY,
  ) {}

  /**
   * Issues a magic-link token, or `null` when the address hit the hourly limit. Callers answer the
   * same way in both cases so the response reveals nothing.
   */
  async issue(
    email: string,
    purpose: LoginTokenPurpose = "sign_in",
    userId: string | null = null,
  ): Promise<{ token: string; email: string; expiresAt: Date } | null> {
    const normalized = normalizeEmail(email);
    if (normalized.length > 254 || !EMAIL_RE.test(normalized))
      throw new ValidationError("Invalid email address");
    if ((purpose === "link") !== (userId !== null))
      throw new ValidationError("A link token needs the user it links to");

    const [recent] = await this.db
      .select({ n: count() })
      .from(loginTokens)
      .where(
        and(
          eq(loginTokens.email, normalized),
          gt(loginTokens.createdAt, sql`now() - interval '1 hour'`),
        ),
      );
    if ((recent?.n ?? 0) >= this.policy.maxPerHour) return null;

    const token = newToken();
    const [row] = await this.db
      .insert(loginTokens)
      .values({
        tokenHash: hashToken(token),
        email: normalized,
        purpose,
        userId,
        expiresAt: sql`now() + make_interval(secs => ${this.policy.ttlSeconds})`,
      })
      .returning({ expiresAt: loginTokens.expiresAt });
    if (!row) throw new Error("insert login_tokens returned no row");
    return { token, email: normalized, expiresAt: row.expiresAt };
  }

  /** Single use: the first successful call wins; later calls fail. */
  async consume(token: string, purpose: LoginTokenPurpose): Promise<ConsumedLoginToken> {
    const [row] = await this.db
      .update(loginTokens)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(loginTokens.tokenHash, hashToken(token)),
          eq(loginTokens.purpose, purpose),
          isNull(loginTokens.usedAt),
          gt(loginTokens.expiresAt, sql`now()`),
        ),
      )
      .returning({
        email: loginTokens.email,
        purpose: loginTokens.purpose,
        userId: loginTokens.userId,
      });
    if (!row) throw new AuthError("invalid");
    return row;
  }

  /** Housekeeping: removes tokens older than a day. */
  async purgeOld(): Promise<number> {
    const rows = await this.db
      .delete(loginTokens)
      .where(sql`${loginTokens.createdAt} < now() - interval '1 day'`)
      .returning({ id: loginTokens.id });
    return rows.length;
  }
}
