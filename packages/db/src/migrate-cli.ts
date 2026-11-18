import { createDatabase, runMigrations } from "./client.js";

/** `pnpm --filter @activen/db db:migrate` — applies pending migrations to DATABASE_URL. */
const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write("DATABASE_URL is not set\n");
  process.exit(1);
}
const database = createDatabase({
  connectionString: url,
  max: 1,
  applicationName: "activen-migrate",
});
try {
  await runMigrations(database.db);
  process.stdout.write("Migrations applied\n");
} finally {
  await database.close();
}
