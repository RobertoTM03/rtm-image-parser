import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { buildTestApp } from "./test-app";
import type { Database } from "../../src/adapters/persistence/postgres/kysely.types";

let app: FastifyInstance | null = null;
let db: Kysely<Database> | null = null;

describe("GET /v1/templates", () => {
  beforeAll(async () => {
    const built = await buildTestApp();
    if (!built) {
      // eslint-disable-next-line no-console
      console.warn("templates.integration.test skipped: no reachable test database.");
      return;
    }
    app = built.app;
    db = built.db;
  });

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
  });

  it("returns the seeded ticket and factura templates", async () => {
    if (!app) return;

    const response = await app.inject({ method: "GET", url: "/v1/templates" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const names = body.templates.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual(["factura", "ticket"]);
  });
});
