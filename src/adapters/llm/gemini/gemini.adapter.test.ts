import { beforeEach, describe, expect, it, vi } from "vitest";

const generateContentMock = vi.fn();

vi.mock("@google/generative-ai", () => {
  class GoogleGenerativeAI {
    constructor(_apiKey: string) {}
    getGenerativeModel(_params: unknown) {
      return { generateContent: generateContentMock };
    }
  }
  return { GoogleGenerativeAI };
});

import { GeminiAdapter, geminiProviderFactory } from "./gemini.adapter";
import type { Config } from "../../../config";

const config: Config = {
  extractionModelIds: ["gemini-1.5-pro"],
  llmModels: [{ id: "gemini-1.5-pro", provider: "gemini", apiKey: "key", model: "gemini-1.5-pro" }],
  crosscheckThreshold: 0.9,
  crosscheckNumericTolerance: 0.01,
  maxRetriesPerModel: 2,
  llmRequestTimeoutMs: 30000,
  maxImageSizeBytes: 10 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg"],
  cacheEnabled: true,
  maxHistoryPageSize: 50,
  databaseUrl: "postgresql://x",
  port: 3000,
};

describe("GeminiAdapter", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
  });

  it("supports a model id only when LLM_MODELS has a matching provider:\"gemini\" entry", () => {
    expect(geminiProviderFactory.supports("gemini-1.5-pro", config)).toBe(true);
    expect(geminiProviderFactory.supports("unknown-id", config)).toBe(false);
    expect(geminiProviderFactory.supports("gemini-1.5-pro", { ...config, llmModels: [] })).toBe(false);
  });

  it("does not support an id whose LLM_MODELS entry belongs to a different provider", () => {
    const otherProviderConfig: Config = {
      ...config,
      llmModels: [{ id: "gemini-1.5-pro", provider: "openai", apiKey: "key", model: "gpt-4o" }],
    };
    expect(geminiProviderFactory.supports("gemini-1.5-pro", otherProviderConfig)).toBe(false);
  });

  it("resolves two distinct models for two different LLM_MODELS entries", () => {
    const twoModelsConfig: Config = {
      ...config,
      llmModels: [...config.llmModels, { id: "gemini-1.5-flash", provider: "gemini", apiKey: "key-2", model: "gemini-1.5-flash" }],
    };

    const first = new GeminiAdapter("gemini-1.5-pro", twoModelsConfig);
    const second = new GeminiAdapter("gemini-1.5-flash", twoModelsConfig);

    expect(first.modelId).toBe("gemini-1.5-pro");
    expect(second.modelId).toBe("gemini-1.5-flash");
  });

  it("parses the model's JSON text into rawOutput", async () => {
    generateContentMock.mockResolvedValue({
      response: { text: () => JSON.stringify({ merchant: "Acme", total: 42 }) },
    });

    const adapter = new GeminiAdapter("gemini-1.5-pro", config);
    const result = await adapter.extract({
      imageBase64: "AAA=",
      mimeType: "image/png",
      documentType: "ticket",
      jsonSchema: { type: "object" },
      fieldHints: {},
    });

    expect(result.modelId).toBe("gemini-1.5-pro");
    expect(result.rawOutput).toEqual({ merchant: "Acme", total: 42 });
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the model returns empty text", async () => {
    generateContentMock.mockResolvedValue({ response: { text: () => "" } });
    const adapter = new GeminiAdapter("gemini-1.5-pro", config);

    await expect(
      adapter.extract({ imageBase64: "AAA=", mimeType: "image/png", documentType: "ticket", jsonSchema: {}, fieldHints: {} }),
    ).rejects.toThrow(/no content/);
  });

  it("throws when the model returns non-JSON text", async () => {
    generateContentMock.mockResolvedValue({ response: { text: () => "not json" } });
    const adapter = new GeminiAdapter("gemini-1.5-pro", config);

    await expect(
      adapter.extract({ imageBase64: "AAA=", mimeType: "image/png", documentType: "ticket", jsonSchema: {}, fieldHints: {} }),
    ).rejects.toThrow(/not valid JSON/);
  });
});
