import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "./kysely.types";

export function createKyselyInstance(databaseUrl: string): Kysely<Database> {
  const dialect = new PostgresDialect({
    pool: new Pool({ connectionString: databaseUrl }),
  });

  return new Kysely<Database>({ dialect });
}
