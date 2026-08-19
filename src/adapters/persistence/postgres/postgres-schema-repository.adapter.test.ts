import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { PostgresSchemaRepository } from "./postgres-schema-repository.adapter";
import { connectTestDb, truncateAll } from "./postgres-test-helpers";
import { DocumentTypeAlreadyExistsError, DocumentTypeNotFoundError } from "../../../domain/errors/domain-errors";
import type { Database } from "./kysely.types";

let db: Kysely<Database> | null = null;

describe("PostgresSchemaRepository", () => {
  beforeAll(async () => {
    db = await connectTestDb();
    if (!db) {
      // eslint-disable-next-line no-console
      console.warn(
        "PostgresSchemaRepository integration tests skipped: no reachable TEST_DATABASE_URL/DATABASE_URL. " +
          "Run `docker compose up -d db` and `npm run migrate:up` first.",
      );
    }
  });

  beforeEach(async () => {
    if (db) await truncateAll(db);
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  it("lists seeded templates", async () => {
    if (!db) return;
    const repo = new PostgresSchemaRepository(db);
    const templates = await repo.listTemplates();
    const names = templates.map((t) => t.name).sort();
    expect(names).toEqual(["factura", "ticket"]);
  });

  it("creates a schema, then rejects a duplicate document_type", async () => {
    if (!db) return;
    const repo = new PostgresSchemaRepository(db);

    const created = await repo.createSchema({
      documentType: "test-doc",
      schema: { type: "object", properties: { a: { type: "string" } } },
      fieldHints: { a: "hint" },
    });

    expect(created.version).toBe(1);
    expect(created.active).toBe(true);

    await expect(
      repo.createSchema({
        documentType: "test-doc",
        schema: { type: "object" },
      }),
    ).rejects.toBeInstanceOf(DocumentTypeAlreadyExistsError);
  });

  it("updateSchema inserts a new version and deactivates the previous one", async () => {
    if (!db) return;
    const repo = new PostgresSchemaRepository(db);

    await repo.createSchema({
      documentType: "test-doc",
      schema: { type: "object", properties: { a: { type: "string" } } },
    });

    const updated = await repo.updateSchema("test-doc", {
      schema: { type: "object", properties: { a: { type: "string" }, b: { type: "number" } } },
    });

    expect(updated.version).toBe(2);
    expect(updated.active).toBe(true);

    const versions = await repo.listVersions("test-doc");
    expect(versions.map((v) => ({ version: v.version, active: v.active }))).toEqual([
      { version: 2, active: true },
      { version: 1, active: false },
    ]);

    const active = await repo.getActiveSchema("test-doc");
    expect(active?.version).toBe(2);
  });

  it("updateSchema throws for an unknown document_type", async () => {
    if (!db) return;
    const repo = new PostgresSchemaRepository(db);
    await expect(repo.updateSchema("does-not-exist", { schema: { type: "object" } })).rejects.toBeInstanceOf(
      DocumentTypeNotFoundError,
    );
  });
});
