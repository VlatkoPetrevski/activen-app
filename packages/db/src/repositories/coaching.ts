import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { ConflictError, isUniqueViolation, NotFoundError, ValidationError } from "../errors.js";
import { auditLog, coachAthletes, consentGrants } from "../schema.js";

export type ConsentScope = "activities" | "sleep_recovery" | "location" | "comments";
export type CoachLinkStatus = "invited" | "active" | "ended";

export interface CoachLink {
  id: string;
  coachId: string;
  athleteId: string;
  status: CoachLinkStatus;
}

export class CoachingRepository {
  constructor(private readonly db: Db) {}

  async invite(coachId: string, athleteId: string): Promise<CoachLink> {
    if (coachId === athleteId) throw new ValidationError("A coach cannot coach themselves");
    try {
      const [row] = await this.db.insert(coachAthletes).values({ coachId, athleteId }).returning();
      if (!row) throw new Error("insert coach_athletes returned no row");
      return toLink(row);
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictError("This coach and athlete are already linked");
      throw e;
    }
  }

  /** The athlete accepts and chooses what the coach may see (ADR-0003: consent per scope). */
  async accept(
    linkId: string,
    athleteId: string,
    scopes: readonly ConsentScope[],
  ): Promise<CoachLink> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(coachAthletes)
        .set({ status: "active", acceptedAt: sql`now()` })
        .where(
          and(
            eq(coachAthletes.id, linkId),
            eq(coachAthletes.athleteId, athleteId),
            eq(coachAthletes.status, "invited"),
          ),
        )
        .returning();
      if (!row) throw new NotFoundError("invitation", linkId);
      if (scopes.length)
        await tx
          .insert(consentGrants)
          .values([...new Set(scopes)].map((scope) => ({ coachAthleteId: linkId, scope })));
      return toLink(row);
    });
  }

  async grant(linkId: string, scope: ConsentScope): Promise<void> {
    await this.db
      .insert(consentGrants)
      .values({ coachAthleteId: linkId, scope })
      .onConflictDoNothing();
  }

  async revoke(linkId: string, scope: ConsentScope): Promise<void> {
    await this.db
      .update(consentGrants)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(consentGrants.coachAthleteId, linkId),
          eq(consentGrants.scope, scope),
          isNull(consentGrants.revokedAt),
        ),
      );
  }

  /** Either side ends the relationship; all consents are revoked with it. */
  async end(linkId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(coachAthletes)
        .set({ status: "ended", endedAt: sql`now()` })
        .where(eq(coachAthletes.id, linkId));
      await tx
        .update(consentGrants)
        .set({ revokedAt: sql`now()` })
        .where(and(eq(consentGrants.coachAthleteId, linkId), isNull(consentGrants.revokedAt)));
    });
  }

  /** Scopes a coach currently holds for an athlete (empty when not actively linked). */
  async scopes(coachId: string, athleteId: string): Promise<ConsentScope[]> {
    const rows = await this.db
      .select({ scope: consentGrants.scope })
      .from(consentGrants)
      .innerJoin(coachAthletes, eq(consentGrants.coachAthleteId, coachAthletes.id))
      .where(
        and(
          eq(coachAthletes.coachId, coachId),
          eq(coachAthletes.athleteId, athleteId),
          eq(coachAthletes.status, "active"),
          isNull(consentGrants.revokedAt),
        ),
      );
    return rows.map((r) => r.scope).sort();
  }

  /** Authorization check used before any coach read; every allowed read is audited. */
  async authorizeCoachRead(
    coachId: string,
    athleteId: string,
    scope: ConsentScope,
  ): Promise<boolean> {
    const allowed = (await this.scopes(coachId, athleteId)).includes(scope);
    if (allowed) await this.recordRead(coachId, athleteId, scope);
    return allowed;
  }

  /** Audit entry for a coach reading data under a consent scope. */
  async recordRead(coachId: string, athleteId: string, scope: ConsentScope): Promise<void> {
    await this.db.insert(auditLog).values({
      actorId: coachId,
      subjectUserId: athleteId,
      action: "coach.read",
      details: { scope },
    });
  }

  /** The athlete's open links (invitations and active coaches). */
  async linksOfAthlete(athleteId: string): Promise<CoachLink[]> {
    const rows = await this.db
      .select()
      .from(coachAthletes)
      .where(and(eq(coachAthletes.athleteId, athleteId), ne(coachAthletes.status, "ended")));
    return rows.map(toLink);
  }

  /** The coach's open links (invited and active athletes). */
  async linksOfCoach(coachId: string): Promise<CoachLink[]> {
    const rows = await this.db
      .select()
      .from(coachAthletes)
      .where(
        and(
          eq(coachAthletes.coachId, coachId),
          inArray(coachAthletes.status, ["invited", "active"]),
        ),
      );
    return rows.map(toLink);
  }

  async get(linkId: string): Promise<CoachLink> {
    const [row] = await this.db.select().from(coachAthletes).where(eq(coachAthletes.id, linkId));
    if (!row) throw new NotFoundError("coach link", linkId);
    return toLink(row);
  }

  /** Active link between the two, if any. */
  async activeLink(coachId: string, athleteId: string): Promise<CoachLink | null> {
    const [row] = await this.db
      .select()
      .from(coachAthletes)
      .where(
        and(
          eq(coachAthletes.coachId, coachId),
          eq(coachAthletes.athleteId, athleteId),
          eq(coachAthletes.status, "active"),
        ),
      );
    return row ? toLink(row) : null;
  }

  async athletesOf(coachId: string): Promise<CoachLink[]> {
    const rows = await this.db
      .select()
      .from(coachAthletes)
      .where(and(eq(coachAthletes.coachId, coachId), eq(coachAthletes.status, "active")));
    return rows.map(toLink);
  }
}

function toLink(row: typeof coachAthletes.$inferSelect): CoachLink {
  return { id: row.id, coachId: row.coachId, athleteId: row.athleteId, status: row.status };
}
