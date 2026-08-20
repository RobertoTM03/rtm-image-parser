import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { buildTestApp, getTestDatabaseUrl } from "./test-app";
import { truncateAll } from "../../src/adapters/persistence/postgres/postgres-test-helpers";
import type { Database } from "../../src/adapters/persistence/postgres/kysely.types";
import type { LLMVisionProviderPort } from "../../src/domain/ports/llm-vision-provider.port";

let dbAvailable = false;
const openDbs: Array<Kysely<Database>> = [];
const openApps: FastifyInstance[] = [];

function fakeProvider(modelId: string, output: unknown): LLMVisionProviderPort {
  return {
    modelId,
    extract: async () => ({ modelId, rawOutput: output, latencyMs: 1 }),
  };
}

async function setupApp(providers: LLMVisionProviderPort[]) {
  const built = await buildTestApp(providers);
  if (!built) return null;
  openDbs.push(built.db);
  openApps.push(built.app);
  await truncateAll(built.db);
  return built.app;
}

describe("POST /v1/extract", () => {
  beforeAll(() => {
    dbAvailable = Boolean(getTestDatabaseUrl());
    if (!dbAvailable) {
      // eslint-disable-next-line no-console
      console.warn("extract.integration.test skipped: no reachable test database.");
    }
  });

  afterEach(async () => {
    while (openApps.length) await openApps.pop()!.close();
    while (openDbs.length) await openDbs.pop()!.destroy();
  });

  const schema = { type: "object", properties: { merchant: { type: "string" }, total: { type: "number" } } };
  const smallPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

  it("happy path: single model returns validated data and metadata", async () => {
    if (!dbAvailable) return;
    const app = await setupApp([fakeProvider("fake-model", { merchant: "Acme", total: 100 })]);
    if (!app) return;

    await app.inject({ method: "POST", url: "/v1/schemas", payload: { documentType: "ticket-extract-1", schema } });

    const response = await app.inject({
      method: "POST",
      url: "/v1/extract",
      payload: { imageBase64: smallPngBase64, mimeType: "image/png", documentType: "ticket-extract-1" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toEqual({ merchant: "Acme", total: 100 });
    expect(body.metadata.modelsUsed).toEqual(["fake-model"]);
    expect(body.metadata.schemaVersion).toBe(1);
  });

  it("400s on an unsupported mime type before calling any model", async () => {
    if (!dbAvailable) return;
    let called = false;
    const provider: LLMVisionProviderPort = {
      modelId: "fake-model",
      extract: async () => {
        called = true;
        return { modelId: "fake-model", rawOutput: {}, latencyMs: 1 };
      },
    };
    const app = await setupApp([provider]);
    if (!app) return;

    await app.inject({ method: "POST", url: "/v1/schemas", payload: { documentType: "ticket-extract-2", schema } });

    const response = await app.inject({
      method: "POST",
      url: "/v1/extract",
      payload: { imageBase64: smallPngBase64, mimeType: "application/pdf", documentType: "ticket-extract-2" },
    });

    expect(response.statusCode).toBe(400);
    expect(called).toBe(false);
  });

  it("400s on an unknown document_type before calling any model", async () => {
    if (!dbAvailable) return;
    let called = false;
    const provider: LLMVisionProviderPort = {
      modelId: "fake-model",
      extract: async () => {
        called = true;
        return { modelId: "fake-model", rawOutput: {}, latencyMs: 1 };
      },
    };
    const app = await setupApp([provider]);
    if (!app) return;

    const response = await app.inject({
      method: "POST",
      url: "/v1/extract",
      payload: { imageBase64: smallPngBase64, mimeType: "image/png", documentType: "does-not-exist" },
    });

    expect(response.statusCode).toBe(400);
    expect(called).toBe(false);
  });

  it("422s with the missing required fields, and still returns the completed JSON, when the real ajv validator sees a gap", async () => {
    if (!dbAvailable) return;
    const requiredSchema = {
      type: "object",
      properties: { merchant: { type: "string" }, total: { type: "number" } },
      required: ["merchant", "total"],
    };
    const app = await setupApp([fakeProvider("fake-model", { merchant: "Acme" })]);
    if (!app) return;

    await app.inject({ method: "POST", url: "/v1/schemas", payload: { documentType: "ticket-extract-5", schema: requiredSchema } });

    const response = await app.inject({
      method: "POST",
      url: "/v1/extract",
      payload: { imageBase64: smallPngBase64, mimeType: "image/png", documentType: "ticket-extract-5" },
    });

    expect(response.statusCode).toBe(422);
    const body = response.json();
    expect(body.error).toBe("missing_required_fields");
    expect(body.missingFields).toEqual(["total"]);
    expect(body.data).toEqual({ merchant: "Acme", total: null });
  });

  it("422s with per-field mismatches when 2 models disagree beyond the threshold", async () => {
    if (!dbAvailable) return;
    const app = await setupApp([
      fakeProvider("model-a", { merchant: "Acme", total: 100 }),
      fakeProvider("model-b", { merchant: "Different Co", total: 999 }),
    ]);
    if (!app) return;

    await app.inject({ method: "POST", url: "/v1/schemas", payload: { documentType: "ticket-extract-4", schema } });

    const response = await app.inject({
      method: "POST",
      url: "/v1/extract",
      payload: { imageBase64: smallPngBase64, mimeType: "image/png", documentType: "ticket-extract-4" },
    });

    expect(response.statusCode).toBe(422);
    const body = response.json();
    expect(body.error).toBe("crosscheck_discordant");
    expect(body.mismatches.length).toBeGreaterThan(0);
  });
});
