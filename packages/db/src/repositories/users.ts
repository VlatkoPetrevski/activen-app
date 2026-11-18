import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import {
  AccountExistsError,
  ConflictError,
  isUniqueViolation,
  NotFoundError,
  ValidationError,
} from "../errors.js";
import { authIdentities, coachAthletes, userRoles, users } from "../schema.js";
import { normalizeEmail } from "./tokens.js";

export type AuthProvider = "google" | "apple" | "email";
export type Role = "athlete" | "coach" | "admin";

/** Roles a person may give themselves; `admin` is granted only by operators. */
export const SELF_SERVICE_ROLES = ["athlete", "coach"] as const satisfies readonly Role[];

export interface User {
  id: string;
  email: string | null;
  displayName: string;
  roles: Role[];
}

export interface Identity {
  id: string;
  provider: AuthProvider;
  email: string | null;
  createdAt: Date;
}

export interface IdentityInput {
  provider: AuthProvider;
  /** Stable subject from the identity provider (OIDC `sub`); for `email`, the normalized address. */
  subject: string;
  /** Verified email from the provider, if any. */
  email: string | null;
  displayName: string;
  /** Roles for a new user (default: athlete). Existing users keep theirs. */
  roles?: Role[];
}

const DISPLAY_NAME_MAX = 100;

function cleanDisplayName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0 || trimmed.length > DISPLAY_NAME_MAX)
    throw new ValidationError(`Display name must be 1–${DISPLAY_NAME_MAX} characters`);
  return trimmed;
}

/** Name for a new account when the provider gives none (Apple after the first sign-in, email). */
function fallbackName(input: IdentityInput): string {
  const fromEmail = input.email?.split("@")[0];
  return input.displayName.trim() || fromEmail || "ActiveN";
}

export class UsersRepository {
  constructor(private readonly db: Db) {}

  async get(id: string): Promise<User> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)));
    if (!row) throw new NotFoundError("user", id);
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      roles: await this.roles(id),
    };
  }

  async roles(userId: string): Promise<Role[]> {
    const rows = await this.db.select().from(userRoles).where(eq(userRoles.userId, userId));
    return rows.map((r) => r.role).sort();
  }

  /**
   * Sign-in: returns the user linked to this external identity, creating user, identity and roles
   * on first sign-in.
   *
   * Accounts are matched by (provider, subject). An email match links automatically only for the
   * `email` provider — a magic link proves control of the mailbox, which is the account-recovery
   * channel anyway. A Google/Apple identity whose email belongs to another account raises
   * {@link AccountExistsError}; the person signs in with the existing method and links it.
   */
  async findOrCreateByIdentity(input: IdentityInput): Promise<{ user: User; created: boolean }> {
    const email = input.email === null ? null : normalizeEmail(input.email);
    const subject = input.provider === "email" ? normalizeEmail(input.subject) : input.subject;
    try {
      return await this.db.transaction(async (tx) => {
        const repo = new UsersRepository(tx as Db);
        const existing = await repo.userIdForIdentity(input.provider, subject);
        if (existing) return { user: await repo.get(existing), created: false };

        const owner = email ? await repo.userIdForEmail(email) : null;
        if (owner) {
          if (input.provider !== "email") throw new AccountExistsError(await repo.providers(owner));
          await tx
            .insert(authIdentities)
            .values({ userId: owner, provider: "email", providerSubject: subject, email });
          return { user: await repo.get(owner), created: false };
        }

        const [user] = await tx
          .insert(users)
          .values({ email, displayName: cleanDisplayName(fallbackName(input)) })
          .returning();
        if (!user) throw new Error("insert users returned no row");
        await tx
          .insert(authIdentities)
          .values({ userId: user.id, provider: input.provider, providerSubject: subject, email });
        const roles = [...new Set(input.roles?.length ? input.roles : (["athlete"] as Role[]))];
        await tx.insert(userRoles).values(roles.map((role) => ({ userId: user.id, role })));
        return {
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            roles: roles.sort(),
          },
          created: true,
        };
      });
    } catch (e) {
      // A concurrent first sign-in with the same identity may have committed in between our reads
      // (unique violation, or its new email seen as "taken"): the winner's account is ours.
      if (isUniqueViolation(e) || e instanceof AccountExistsError) {
        const winner = await this.userIdForIdentity(input.provider, subject);
        if (winner) return { user: await this.get(winner), created: false };
        if (email) {
          const owner = await this.userIdForEmail(email);
          if (owner) throw new AccountExistsError(await this.providers(owner));
        }
      }
      throw e;
    }
  }

  async updateProfile(userId: string, patch: { displayName?: string }): Promise<User> {
    if (patch.displayName !== undefined) {
      const [row] = await this.db
        .update(users)
        .set({ displayName: cleanDisplayName(patch.displayName), updatedAt: sql`now()` })
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .returning({ id: users.id });
      if (!row) throw new NotFoundError("user", userId);
    }
    return this.get(userId);
  }

  async addRole(userId: string, role: Role): Promise<Role[]> {
    await this.get(userId);
    await this.db.insert(userRoles).values({ userId, role }).onConflictDoNothing();
    return this.roles(userId);
  }

  /**
   * Removes a role. A person keeps at least one role, and a coach with athletes (invited or active)
   * ends those links first.
   */
  async removeRole(userId: string, role: Role): Promise<Role[]> {
    const current = (await this.get(userId)).roles;
    if (!current.includes(role)) return current;
    if (current.length === 1) throw new ConflictError("A user keeps at least one role");
    if (role === "coach") {
      const [links] = await this.db
        .select({ n: count() })
        .from(coachAthletes)
        .where(
          and(
            eq(coachAthletes.coachId, userId),
            inArray(coachAthletes.status, ["invited", "active"]),
          ),
        );
      if ((links?.n ?? 0) > 0) throw new ConflictError("End coaching relationships first");
    }
    await this.db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)));
    return this.roles(userId);
  }

  async identities(userId: string): Promise<Identity[]> {
    return this.db
      .select({
        id: authIdentities.id,
        provider: authIdentities.provider,
        email: authIdentities.email,
        createdAt: authIdentities.createdAt,
      })
      .from(authIdentities)
      .where(eq(authIdentities.userId, userId))
      .orderBy(asc(authIdentities.createdAt));
  }

  /**
   * Adds a sign-in method to a signed-in user (the caller has verified the identity). Idempotent for
   * the same user; an identity already used by another account is a conflict.
   */
  async linkIdentity(
    userId: string,
    input: Pick<IdentityInput, "provider" | "subject" | "email">,
  ): Promise<Identity[]> {
    await this.get(userId);
    const subject = input.provider === "email" ? normalizeEmail(input.subject) : input.subject;
    const email = input.email === null ? null : normalizeEmail(input.email);
    const owner = await this.userIdForIdentity(input.provider, subject);
    if (owner && owner !== userId)
      throw new ConflictError("This sign-in method belongs to another account");
    if (!owner)
      try {
        await this.db
          .insert(authIdentities)
          .values({ userId, provider: input.provider, providerSubject: subject, email });
      } catch (e) {
        if (isUniqueViolation(e))
          throw new ConflictError("This sign-in method belongs to another account");
        throw e;
      }
    return this.identities(userId);
  }

  /** Removes a sign-in method; the last one cannot be removed (the account would be unreachable). */
  async unlinkIdentity(userId: string, identityId: string): Promise<Identity[]> {
    await this.db.transaction(async (tx) => {
      // Lock the user's identities so two parallel unlinks cannot remove the last two.
      const rows = await tx
        .select({ id: authIdentities.id })
        .from(authIdentities)
        .where(eq(authIdentities.userId, userId))
        .for("update");
      if (!rows.some((r) => r.id === identityId)) throw new NotFoundError("identity", identityId);
      if (rows.length === 1) throw new ConflictError("The last sign-in method cannot be removed");
      await tx.delete(authIdentities).where(eq(authIdentities.id, identityId));
    });
    return this.identities(userId);
  }

  /**
   * Deletes the account and, through cascades, all of its data (GDPR art. 17). Audit entries keep
   * their rows with the user reference cleared.
   */
  async deleteAccount(userId: string): Promise<void> {
    const rows = await this.db
      .delete(users)
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    if (rows.length === 0) throw new NotFoundError("user", userId);
  }

  private async userIdForIdentity(provider: AuthProvider, subject: string): Promise<string | null> {
    const [row] = await this.db
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(
        and(eq(authIdentities.provider, provider), eq(authIdentities.providerSubject, subject)),
      );
    return row?.userId ?? null;
  }

  private async userIdForEmail(email: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${email}`, isNull(users.deletedAt)));
    return row?.id ?? null;
  }

  private async providers(userId: string): Promise<AuthProvider[]> {
    const rows = await this.db
      .selectDistinct({ provider: authIdentities.provider })
      .from(authIdentities)
      .where(eq(authIdentities.userId, userId));
    return rows.map((r) => r.provider).sort();
  }
}
