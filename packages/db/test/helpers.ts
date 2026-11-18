import { afterAll, beforeEach, inject } from "vitest";
import { createDatabase, type Database } from "../src/client.js";
import { createRepositories, type Repositories } from "../src/repositories/index.js";

/** One pool per test file; every test starts with empty tables. */
export function useDatabase(): { database: () => Database; repos: () => Repositories } {
  const database = createDatabase({ connectionString: inject("databaseUrl"), max: 4 });
  const repos = createRepositories(database.db);
  beforeEach(async () => {
    const { rows } = await database.pool.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    await database.pool.query(
      `truncate ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`,
    );
  });
  afterAll(() => database.close());
  return { database: () => database, repos: () => repos };
}

export async function createUser(
  repos: Repositories,
  name = "Влатко",
  roles?: ("athlete" | "coach")[],
) {
  const { user } = await repos.users.findOrCreateByIdentity({
    provider: "google",
    subject: `sub-${name}-${Math.random()}`,
    email: `${encodeURIComponent(name)}-${Math.random()}@example.com`,
    displayName: name,
    ...(roles ? { roles } : {}),
  });
  return user;
}
