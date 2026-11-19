/* eslint-disable no-console -- command-line tool */
/**
 * Development helper: `DATABASE_URL=… pnpm --filter @activen/db seed:demo you@example.com [en]`
 * loads a demo training block into the account with that email (created if missing).
 */
import { createDatabase } from "./client.js";
import { seedDemoData } from "./demo-seed.js";
import { createRepositories } from "./repositories/index.js";

const [email, locale = "mk"] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!email || !url || (locale !== "mk" && locale !== "en")) {
  console.error("Usage: DATABASE_URL=postgres://… seed-demo <email> [mk|en]");
  process.exit(2);
}
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to load demo data in production.");
  process.exit(2);
}
const database = createDatabase({ connectionString: url, max: 2 });
try {
  const repos = createRepositories(database.db);
  const { user } = await repos.users.findOrCreateByIdentity({
    provider: "email",
    subject: email,
    email,
    displayName: "",
  });
  const settings = await repos.settings.get(user.id);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: settings.timeZone }).format(
    new Date(),
  );
  const result = await seedDemoData(repos, user.id, { today, locale });
  console.log(`Demo data for ${email} (${user.id}):`, result);
} finally {
  await database.close();
}
