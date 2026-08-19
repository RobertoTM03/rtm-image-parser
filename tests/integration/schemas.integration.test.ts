import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { buildTestApp } from "./test-app";
import { truncateAll } from "../../src/adapters/persistence/postgres/postgres-test-helpers";
import type { Database } from "../../src/adapters/persistence/postgres/kysely.types";

let app: FastifyInstance | null = null;
let db: Kysely<Database> | null = null;

describe("/v1/schemas", () => {
  beforeAll(async () => {
    const built = await buildTestApp();
    if (!built) {
      // eslint-disable-next-line no-console
      console.warn("schemas.integration.test skipped: no reachable test database.");
      return;
    }
    app = built.app;
    db = built.db;
  });

  beforeEach(async () => {
    if (db) await truncateAll(db);
  });

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
  });

  it("creates a schema from scratch, then fetches it by document_type", async () => {
    if (!app) return;

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/schemas",
      payload: {
        documentType: "custom-doc",
        schema: { type: "object", properties: { foo: { type: "string" } } },
        fieldHints: { foo: "the foo field" },
      },
    });
    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json().version).toBe(1);

    const getResponse = await app.inject({ method: "GET", url: "/v1/schemas/custom-doc" });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json().documentType).toBe("custom-doc");
  });

  it("PUT bumps the version and GET .../versions returns full history", async () => {
    if (!app) return;

    await app.inject({
      method: "POST",
      url: "/v1/schemas",
      payload: { documentType: "versioned-doc", schema: { type: "object" } },
    });

    const putResponse = await app.inject({
      method: "PUT",
      url: "/v1/schemas/versioned-doc",
      payload: { schema: { type: "object", properties: { a: { type: "string" } } } },
    });
    expect(putResponse.statusCode).toBe(200);
    expect(putResponse.json().version).toBe(2);

    const versionsResponse = await app.inject({ method: "GET", url: "/v1/schemas/versioned-doc/versions" });
    expect(versionsResponse.statusCode).toBe(200);
    const versions = versionsResponse.json().versions;
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
  });

  it("returns 404 for an unknown document_type", async () => {
    if (!app) return;
    const response = await app.inject({ method: "GET", url: "/v1/schemas/does-not-exist" });
    expect(response.statusCode).toBe(404);
  });

  it("GET /v1/schemas lists all active schema definitions", async () => {
    if (!app) return;
    await app.inject({ method: "POST", url: "/v1/schemas", payload: { documentType: "doc-a", schema: { type: "object" } } });
    await app.inject({ method: "POST", url: "/v1/schemas", payload: { documentType: "doc-b", schema: { type: "object" } } });

    const response = await app.inject({ method: "GET", url: "/v1/schemas" });
    expect(response.statusCode).toBe(200);
    const documentTypes = response.json().schemas.map((s: { documentType: string }) => s.documentType).sort();
    expect(documentTypes).toEqual(["doc-a", "doc-b"]);
  });

  it("creating from a template inherits its schema and hints", async () => {
    if (!app) return;
    const response = await app.inject({
      method: "POST",
      url: "/v1/schemas",
      payload: { documentType: "my-ticket", basedOnTemplate: "ticket" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().basedOnTemplate).toBe("ticket");
    expect(response.json().schema.properties).toHaveProperty("merchant");
  });
});
