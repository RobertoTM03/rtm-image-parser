import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import { PostgresExtractionLogRepository } from "./postgres-extraction-log-repository.adapter";
import { connectTestDb, truncateAll } from "./postgres-test-helpers";
import type { Database } from "./kysely.types";

let db: Kysely<Database> | null = null;

describe("PostgresExtractionLogRepository", () => {
  beforeAll(async () => {
    db = await connectTestDb();
    if (!db) {
      // eslint-disable-next-line no-console
      console.warn("PostgresExtractionLogRepository integration tests skipped: no reachable test database.");
    }
  });

  beforeEach(async () => {
    if (db) await truncateAll(db);
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  it("persists all metadata fields", async () => {
    if (!db) return;
    const repo = new PostgresExtractionLogRepository(db);

    await repo.save({
      documentType: "ticket",
      schemaVersion: 1,
      modelsUsed: ["gemini-1.5-pro"],
      modelsDropped: [{ modelId: "azure-gpt-4o", reason: "schema_validation_failed" }],
      confidence: 0.95,
      crosscheckPassed: null,
      processingTimeMs: 1234,
      status: "ok",
      imageHash: "hash-1",
      resultData: { merchant: "Acme", total: 100 },
    });

    const rows = await sql<{
      document_type: string;
      schema_version: number;
      models_used: string[];
      models_dropped: Array<{ modelId: string; reason: string }>;
      confidence: string;
      processing_time_ms: number;
      status: string;
      image_hash: string;
      result_data: Record<string, unknown>;
    }>`select * from extraction_logs`.execute(db);

    expect(rows.rows).toHaveLength(1);
    const row = rows.rows[0]!;
    expect(row.document_type).toBe("ticket");
    expect(row.schema_version).toBe(1);
    expect(row.models_used).toEqual(["gemini-1.5-pro"]);
    expect(row.models_dropped).toEqual([{ modelId: "azure-gpt-4o", reason: "schema_validation_failed" }]);
    expect(Number(row.confidence)).toBeCloseTo(0.95);
    expect(row.processing_time_ms).toBe(1234);
    expect(row.status).toBe("ok");
    expect(row.image_hash).toBe("hash-1");
    expect(row.result_data).toEqual({ merchant: "Acme", total: 100 });
  });

  it("finds the most recent successful result for a given image/document type/schema version", async () => {
    if (!db) return;
    const repo = new PostgresExtractionLogRepository(db);

    await repo.save({
      documentType: "ticket",
      schemaVersion: 1,
      modelsUsed: ["gemini-1.5-pro"],
      modelsDropped: [],
      confidence: 1,
      crosscheckPassed: null,
      processingTimeMs: 100,
      status: "discordant",
      imageHash: "hash-2",
      resultData: null,
    });
    await repo.save({
      documentType: "ticket",
      schemaVersion: 1,
      modelsUsed: ["gemini-1.5-pro"],
      modelsDropped: [],
      confidence: 1,
      crosscheckPassed: null,
      processingTimeMs: 100,
      status: "ok",
      imageHash: "hash-2",
      resultData: { merchant: "Acme", total: 42 },
    });

    const hit = await repo.findCachedResult("hash-2", "ticket", 1);
    expect(hit).not.toBeNull();
    expect(hit!.resultData).toEqual({ merchant: "Acme", total: 42 });

    const miss = await repo.findCachedResult("hash-2", "ticket", 2);
    expect(miss).toBeNull();
  });

  it("paginates recent logs newest-first and reports whether more pages remain", async () => {
    if (!db) return;
    const repo = new PostgresExtractionLogRepository(db);

    for (const imageHash of ["hash-a", "hash-b", "hash-c"]) {
      await repo.save({
        documentType: "ticket",
        schemaVersion: 1,
        modelsUsed: ["gemini-1.5-pro"],
        modelsDropped: [],
        confidence: 1,
        crosscheckPassed: null,
        processingTimeMs: 100,
        status: "ok",
        imageHash,
        resultData: null,
      });
    }

    const firstPage = await repo.findRecent(2, 0);
    expect(firstPage.logs).toHaveLength(2);
    expect(firstPage.logs.map((l) => l.imageHash)).toEqual(["hash-c", "hash-b"]);
    expect(firstPage.hasMore).toBe(true);

    const secondPage = await repo.findRecent(2, 2);
    expect(secondPage.logs.map((l) => l.imageHash)).toEqual(["hash-a"]);
    expect(secondPage.hasMore).toBe(false);
  });
});
