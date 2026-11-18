import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { AuthError, NotFoundError } from "../errors.js";
import { refreshTokens, sessions, users } from "../schema.js";
import { hashToken, newToken } from "./tokens.js";

export interface SessionPolicy {
  /** Absolute session lifetime; afterwards the user signs in again. */
  sessionTtlSeconds: number;
  /** Lifetime of each refresh token (sliding window). */
  refreshTtlSeconds: number;
  /**
   * A just-used refresh token presented again within this window (parallel tabs/requests) gets a new
   * token instead of being treated as theft.
   */
  reuseGraceSeconds: number;
}

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  sessionTtlSeconds: 180 * 24 * 3600,
  refreshTtlSeconds: 30 * 24 * 3600,
  reuseGraceSeconds: 30,
};

export interface SessionInfo {
  id: string;
  userId: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  userAgent: string | null;
}

export interface IssuedSession {
  sessionId: string;
  userId: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const USER_AGENT_MAX = 200;

export class SessionsRepository {
  constructor(
    private readonly db: Db,
    private readonly policy: SessionPolicy = DEFAULT_SESSION_POLICY,
  ) {}

  async create(userId: string, userAgent: string | null = null): Promise<IssuedSession> {
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .insert(sessions)
        .values({
          userId,
          expiresAt: sql`now() + make_interval(secs => ${this.policy.sessionTtlSeconds})`,
          userAgent: userAgent?.slice(0, USER_AGENT_MAX) ?? null,
        })
        .returning();
      if (!session) throw new Error("insert sessions returned no row");
      return this.issueRefresh(tx as Db, session.id, userId);
    });
  }

  /**
   * Exchanges a refresh token for a new one (rotation). A token used again after the grace window
   * means it was copied: the whole session is revoked (RFC 9700 §4.14.2).
   */
  async rotate(refreshToken: string): Promise<IssuedSession> {
    const outcome = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          tokenId: refreshTokens.id,
          expired: sql<boolean>`${refreshTokens.expiresAt} <= now()`,
          usedAt: refreshTokens.usedAt,
          inGrace: sql<boolean>`${refreshTokens.usedAt} > now() - make_interval(secs => ${this.policy.reuseGraceSeconds})`,
          sessionId: sessions.id,
          userId: sessions.userId,
          revokedAt: sessions.revokedAt,
          sessionExpired: sql<boolean>`${sessions.expiresAt} <= now()`,
          userDeleted: sql<boolean>`${users.deletedAt} is not null`,
        })
        .from(refreshTokens)
        .innerJoin(sessions, eq(sessions.id, refreshTokens.sessionId))
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(refreshTokens.tokenHash, hashToken(refreshToken)))
        .for("update", { of: [refreshTokens, sessions] });

      if (!row) return { error: "invalid" as const };
      if (row.revokedAt || row.userDeleted) return { error: "revoked" as const };
      if (row.sessionExpired || row.expired) return { error: "expired" as const };
      if (row.usedAt && !row.inGrace) {
        await this.revokeTx(tx as Db, row.sessionId, "refresh_token_reuse");
        return { error: "reused" as const };
      }
      if (!row.usedAt)
        await tx
          .update(refreshTokens)
          .set({ usedAt: sql`now()` })
          .where(eq(refreshTokens.id, row.tokenId));
      await tx
        .update(sessions)
        .set({ lastUsedAt: sql`now()` })
        .where(eq(sessions.id, row.sessionId));
      return { issued: await this.issueRefresh(tx as Db, row.sessionId, row.userId) };
    });
    // The revocation above must commit, so the error is raised outside the transaction.
    if ("error" in outcome) throw new AuthError(outcome.error);
    return outcome.issued;
  }

  /** Signs out the session the refresh token belongs to; unknown tokens are ignored (idempotent). */
  async revokeByRefreshToken(refreshToken: string): Promise<void> {
    const [row] = await this.db
      .select({ sessionId: refreshTokens.sessionId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashToken(refreshToken)));
    if (row) await this.revokeTx(this.db, row.sessionId, "sign_out");
  }

  /** Signs out one of the user's own sessions. */
  async revoke(userId: string, sessionId: string, reason = "sign_out"): Promise<void> {
    const [row] = await this.db
      .update(sessions)
      .set({ revokedAt: sql`now()`, revokedReason: reason })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .returning({ id: sessions.id });
    if (!row) throw new NotFoundError("session", sessionId);
  }

  /** Signs out everywhere, optionally keeping the current session. Returns how many were revoked. */
  async revokeAll(
    userId: string,
    exceptSessionId?: string,
    reason = "sign_out_all",
  ): Promise<number> {
    const rows = await this.db
      .update(sessions)
      .set({ revokedAt: sql`now()`, revokedReason: reason })
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, sql`now()`),
          exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined,
        ),
      )
      .returning({ id: sessions.id });
    return rows.length;
  }

  /** Active (not revoked, not expired) sessions, most recently used first. */
  async listActive(userId: string): Promise<SessionInfo[]> {
    return this.db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        createdAt: sessions.createdAt,
        lastUsedAt: sessions.lastUsedAt,
        expiresAt: sessions.expiresAt,
        userAgent: sessions.userAgent,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, sql`now()`),
        ),
      )
      .orderBy(desc(sessions.lastUsedAt));
  }

  async isActive(sessionId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.id, sessionId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, sql`now()`),
        ),
      );
    return row !== undefined;
  }

  /** Housekeeping: drops refresh tokens that can no longer be used. */
  async purgeExpiredTokens(): Promise<number> {
    const rows = await this.db
      .delete(refreshTokens)
      .where(sql`${refreshTokens.expiresAt} < now() - interval '1 day'`)
      .returning({ id: refreshTokens.id });
    return rows.length;
  }

  private async issueRefresh(db: Db, sessionId: string, userId: string): Promise<IssuedSession> {
    const refreshToken = newToken();
    const [row] = await db
      .insert(refreshTokens)
      .values({
        sessionId,
        tokenHash: hashToken(refreshToken),
        // Never beyond the session's absolute expiry.
        expiresAt: sql`least(now() + make_interval(secs => ${this.policy.refreshTtlSeconds}), (select expires_at from sessions where id = ${sessionId}))`,
      })
      .returning({ expiresAt: refreshTokens.expiresAt });
    if (!row) throw new Error("insert refresh_tokens returned no row");
    return { sessionId, userId, refreshToken, refreshExpiresAt: row.expiresAt };
  }

  private async revokeTx(db: Db, sessionId: string, reason: string): Promise<void> {
    await db
      .update(sessions)
      .set({ revokedAt: sql`now()`, revokedReason: reason })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
  }
}
