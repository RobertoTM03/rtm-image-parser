import "dotenv/config";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import { createKyselyInstance } from "./kysely-client";
import type { Database } from "./kysely.types";

/**
 * Test-only helper. Connects to a real Postgres instance (docker-compose `db`
 * service or any local Postgres) for adapter integration tests. Returns null
 * if no test database is reachable so callers can skip cleanly.
 */
export function getTestDatabaseUrl(): string | undefined {
  return process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
}

export async function connectTestDb(): Promise<Kysely<Database> | null> {
  const url = getTestDatabaseUrl();
  if (!url) return null;

  const db = createKyselyInstance(url);
  try {
    await sql`select 1`.execute(db);
    return db;
  } catch {
    await db.destroy();
    return null;
  }
}

export async function truncateAll(db: Kysely<Database>): Promise<void> {
  await sql`truncate table extraction_logs, schema_definitions restart identity cascade`.execute(db);
}
