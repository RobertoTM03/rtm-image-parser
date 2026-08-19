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

import { GeminiAdapter, geminiProviderFactory, GEMINI_SUPPORTED_MODELS } from "./gemini.adapter";
import type { Config } from "../../../config";

const config: Config = {
  extractionModelIds: ["gemini-1.5-pro"],
  azureOpenAI: null,
  gemini: { apiKey: "key", modelName: "gemini-1.5-pro" },
  crosscheckThreshold: 0.9,
  crosscheckNumericTolerance: 0.01,
  maxRetriesPerModel: 2,
  llmRequestTimeoutMs: 30000,
  maxImageSizeBytes: 10 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg"],
  databaseUrl: "postgresql://x",
  port: 3000,
};

describe("GeminiAdapter", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
  });

  it("declares gemini-1.5-pro as an example supported id", () => {
    expect(GEMINI_SUPPORTED_MODELS).toContain("gemini-1.5-pro");
  });

  it("supports any gemini-* labeled model id, not just the example ones", () => {
    expect(geminiProviderFactory.supports("gemini-1.5-pro")).toBe(true);
    expect(geminiProviderFactory.supports("gemini-2.0-flash")).toBe(true);
    expect(geminiProviderFactory.supports("azure-gpt-4o")).toBe(false);
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
