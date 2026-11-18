import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../client.js";
import { NotFoundError } from "../errors.js";
import { authIdentities, userRoles, users } from "../schema.js";

export type AuthProvider = "google" | "apple" | "email";
export type Role = "athlete" | "coach" | "admin";

export interface User {
  id: string;
  email: string | null;
  displayName: string;
  roles: Role[];
}

export interface IdentityInput {
  provider: AuthProvider;
  /** Stable subject from the identity provider (OIDC `sub`). Never the email. */
  subject: string;
  email: string | null;
  displayName: string;
  /** Roles for a new user (default: athlete). Existing users keep theirs. */
  roles?: Role[];
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
   * on first sign-in. Matching is by (provider, subject) only — an email match never links accounts
   * automatically (account takeover risk); linking is an explicit, authenticated action.
   */
  async findOrCreateByIdentity(input: IdentityInput): Promise<{ user: User; created: boolean }> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ userId: authIdentities.userId })
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.provider, input.provider),
            eq(authIdentities.providerSubject, input.subject),
          ),
        );
      if (existing)
        return { user: await new UsersRepository(tx as Db).get(existing.userId), created: false };

      const [user] = await tx
        .insert(users)
        .values({ email: input.email, displayName: input.displayName })
        .returning();
      if (!user) throw new Error("insert users returned no row");
      await tx.insert(authIdentities).values({
        userId: user.id,
        provider: input.provider,
        providerSubject: input.subject,
        email: input.email,
      });
      const roles = input.roles?.length ? input.roles : (["athlete"] as Role[]);
      await tx.insert(userRoles).values(roles.map((role) => ({ userId: user.id, role })));
      return {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          roles: [...roles].sort(),
        },
        created: true,
      };
    });
  }

  async addRole(userId: string, role: Role): Promise<void> {
    await this.get(userId);
    await this.db.insert(userRoles).values({ userId, role }).onConflictDoNothing();
  }
}
