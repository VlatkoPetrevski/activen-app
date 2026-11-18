import { randomBytes } from "node:crypto";
import pg from "pg";
import type { TestProject } from "vitest/node";
import { createDatabase, runMigrations } from "../src/client.js";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Creates a throw-away database on the server in TEST_DATABASE_URL (default: local Postgres),
 * applies all migrations, and drops it afterwards. CI points TEST_DATABASE_URL at a service
 * container; locally use `docker compose up db` or any Postgres 16.
 */
export default async function setup(project: TestProject) {
  const admin = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/postgres";
  const name = `activen_test_${randomBytes(4).toString("hex")}`;
  const client = new pg.Client({ connectionString: admin });
  await client.connect();
  await client.query(`create database ${name}`);
  await client.end();

  const url = new URL(admin);
  url.pathname = `/${name}`;
  const database = createDatabase({ connectionString: url.toString(), max: 1 });
  await runMigrations(database.db);
  await database.close();
  project.provide("databaseUrl", url.toString());

  return async () => {
    const c = new pg.Client({ connectionString: admin });
    await c.connect();
    await c.query(`drop database if exists ${name} with (force)`);
    await c.end();
  };
}
