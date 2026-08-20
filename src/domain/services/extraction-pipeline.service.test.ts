import { describe, expect, it, vi } from "vitest";
import { ExtractionPipelineService } from "./extraction-pipeline.service";
import type { SchemaValidator } from "./extraction-pipeline.service";
import { CrosscheckService } from "./crosscheck.service";
import type { LLMVisionProviderPort, LLMVisionExtractionResponse } from "../ports/llm-vision-provider.port";
import type { ExtractionLogRepositoryPort } from "../ports/extraction-log-repository.port";
import type { SchemaDefinition } from "../entities/schema-definition.entity";
import { AllModelsFailedError } from "../errors/domain-errors";

const schema: SchemaDefinition = {
  id: "s1",
  documentType: "ticket",
  version: 3,
  basedOnTemplate: "ticket",
  schema: { type: "object", properties: { merchant: { type: "string" }, total: { type: "number" } } },
  fieldHints: {},
  active: true,
  createdAt: new Date(),
};

function provider(modelId: string, impl: () => Promise<LLMVisionExtractionResponse>): LLMVisionProviderPort {
  return { modelId, extract: vi.fn(impl) };
}

function alwaysValid(): SchemaValidator {
  return () => ({ valid: true, errors: [] });
}

function fakeLogRepo(): ExtractionLogRepositoryPort & { saved: unknown[] } {
  const saved: unknown[] = [];
  return {
    saved,
    save: async (log) => {
      saved.push(log);
    },
    findRecent: async () => [],
    findCachedResult: async () => null,
  };
}

describe("ExtractionPipelineService", () => {
  const baseConfig = {
    maxRetriesPerModel: 1,
    crosscheckThreshold: 0.9,
    crosscheckNumericTolerance: 0.01,
    cacheEnabled: true,
  };

  it("skips crosscheck and returns the result directly when only one model survives", async () => {
    const p1 = provider("gemini-1.5-pro", async () => ({
      modelId: "gemini-1.5-pro",
      rawOutput: { merchant: "Acme", total: 100 },
      latencyMs: 10,
    }));
    const logRepo = fakeLogRepo();
    const pipeline = new ExtractionPipelineService([p1], new CrosscheckService(), alwaysValid(), logRepo, baseConfig);

    const result = await pipeline.execute({ imageBase64: "x", mimeType: "image/png", activeSchema: schema });

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toEqual({ merchant: "Acme", total: 100 });
      expect(result.metadata.modelsUsed).toEqual(["gemini-1.5-pro"]);
      expect(result.metadata.schemaVersion).toBe(3);
    }
    expect(logRepo.saved).toHaveLength(1);
  });

  it("retries a model on invalid output then drops it, without failing the whole request", async () => {
    let calls = 0;
    const flaky = provider("azure-gpt-4o", async () => {
      calls += 1;
      return { modelId: "azure-gpt-4o", rawOutput: { merchant: "Acme" }, latencyMs: 5 };
    });
    const stable = provider("gemini-1.5-pro", async () => ({
      modelId: "gemini-1.5-pro",
      rawOutput: { merchant: "Acme", total: 100 },
      latencyMs: 5,
    }));

    const validator: SchemaValidator = (_schema, data) => {
      const d = data as Record<string, unknown>;
      return { valid: typeof d.total === "number", errors: d.total === undefined ? ["missing total"] : [] };
    };

    const logRepo = fakeLogRepo();
    const pipeline = new ExtractionPipelineService(
      [flaky, stable],
      new CrosscheckService(),
      validator,
      logRepo,
      baseConfig,
    );

    const result = await pipeline.execute({ imageBase64: "x", mimeType: "image/png", activeSchema: schema });

    expect(calls).toBe(baseConfig.maxRetriesPerModel + 1);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.metadata.modelsUsed).toEqual(["gemini-1.5-pro"]);
      expect(result.metadata.modelsDropped).toHaveLength(1);
      expect(result.metadata.modelsDropped[0]!.modelId).toBe("azure-gpt-4o");
    }
  });

  it("throws AllModelsFailedError when every model fails validation", async () => {
    const p1 = provider("azure-gpt-4o", async () => ({ modelId: "azure-gpt-4o", rawOutput: {}, latencyMs: 1 }));
    const p2 = provider("gemini-1.5-pro", async () => ({ modelId: "gemini-1.5-pro", rawOutput: {}, latencyMs: 1 }));

    const alwaysInvalid: SchemaValidator = () => ({ valid: false, errors: ["nope"] });
    const logRepo = fakeLogRepo();
    const pipeline = new ExtractionPipelineService(
      [p1, p2],
      new CrosscheckService(),
      alwaysInvalid,
      logRepo,
      baseConfig,
    );

    await expect(
      pipeline.execute({ imageBase64: "x", mimeType: "image/png", activeSchema: schema }),
    ).rejects.toBeInstanceOf(AllModelsFailedError);
    expect(logRepo.saved).toHaveLength(0);
  });

  it("returns a discordant result with mismatches when crosscheck fails, without inventing a winner", async () => {
    const p1 = provider("azure-gpt-4o", async () => ({
      modelId: "azure-gpt-4o",
      rawOutput: { merchant: "Acme", total: 100 },
      latencyMs: 1,
    }));
    const p2 = provider("gemini-1.5-pro", async () => ({
      modelId: "gemini-1.5-pro",
      rawOutput: { merchant: "Different Co", total: 900 },
      latencyMs: 1,
    }));

    const logRepo = fakeLogRepo();
    const pipeline = new ExtractionPipelineService(
      [p1, p2],
      new CrosscheckService(),
      alwaysValid(),
      logRepo,
      baseConfig,
    );

    const result = await pipeline.execute({ imageBase64: "x", mimeType: "image/png", activeSchema: schema });

    expect(result.kind).toBe("discordant");
    if (result.kind === "discordant") {
      expect(result.mismatches.length).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(baseConfig.crosscheckThreshold);
    }
    expect(logRepo.saved).toHaveLength(1);
  });

  it("happy path: 2 agreeing models produce full metadata", async () => {
    const p1 = provider("azure-gpt-4o", async () => ({
      modelId: "azure-gpt-4o",
      rawOutput: { merchant: "Acme", total: 100 },
      latencyMs: 1,
    }));
    const p2 = provider("gemini-1.5-pro", async () => ({
      modelId: "gemini-1.5-pro",
      rawOutput: { merchant: "Acme", total: 100 },
      latencyMs: 1,
    }));

    const logRepo = fakeLogRepo();
    const pipeline = new ExtractionPipelineService(
      [p1, p2],
      new CrosscheckService(),
      alwaysValid(),
      logRepo,
      baseConfig,
    );

    const result = await pipeline.execute({ imageBase64: "x", mimeType: "image/png", activeSchema: schema });

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toEqual({ merchant: "Acme", total: 100 });
      expect(result.metadata).toEqual({
        modelsUsed: ["azure-gpt-4o", "gemini-1.5-pro"],
        modelsDropped: [],
        confidence: 1,
        processingTimeMs: expect.any(Number),
        schemaVersion: 3,
        cached: false,
      });
    }
  });

  it("returns a cached result without calling any provider on a cache hit", async () => {
    const provider1 = provider("azure-gpt-4o", vi.fn());
    const logRepo = fakeLogRepo();
    logRepo.findCachedResult = async () => ({
      id: "log-1",
      documentType: "ticket",
      schemaVersion: 3,
      modelsUsed: ["azure-gpt-4o"],
      modelsDropped: [],
      confidence: 1,
      crosscheckPassed: null,
      processingTimeMs: 500,
      status: "ok",
      imageHash: "abc123",
      resultData: { merchant: "Acme", total: 100 },
      createdAt: new Date(),
    });

    const pipeline = new ExtractionPipelineService(
      [provider1],
      new CrosscheckService(),
      alwaysValid(),
      logRepo,
      baseConfig,
    );

    const result = await pipeline.execute({ imageBase64: "x", mimeType: "image/png", activeSchema: schema });

    expect(provider1.extract).not.toHaveBeenCalled();
    expect(logRepo.saved).toHaveLength(0);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data).toEqual({ merchant: "Acme", total: 100 });
      expect(result.metadata.cached).toBe(true);
    }
  });

  it("ignores an existing cache entry and calls the providers when caching is disabled", async () => {
    const p1 = provider("azure-gpt-4o", async () => ({
      modelId: "azure-gpt-4o",
      rawOutput: { merchant: "Acme", total: 100 },
      latencyMs: 1,
    }));
    const logRepo = fakeLogRepo();
    const findCachedResult = vi.fn(logRepo.findCachedResult);
    logRepo.findCachedResult = findCachedResult;

    const pipeline = new ExtractionPipelineService([p1], new CrosscheckService(), alwaysValid(), logRepo, {
      ...baseConfig,
      cacheEnabled: false,
    });

    const result = await pipeline.execute({ imageBase64: "x", mimeType: "image/png", activeSchema: schema });

    expect(findCachedResult).not.toHaveBeenCalled();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.metadata.cached).toBe(false);
    }
    expect(logRepo.saved).toHaveLength(1);
  });
});
