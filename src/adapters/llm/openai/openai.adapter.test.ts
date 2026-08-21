import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("openai", () => {
  class OpenAI {
    chat = { completions: { create: createMock } };
    constructor(_opts: unknown) {}
  }
  return { OpenAI };
});

import { OpenAIAdapter, openAIProviderFactory } from "./openai.adapter";
import type { Config } from "../../../config";

const config: Config = {
  extractionModelIds: ["openai-gpt-4o"],
  llmModels: [{ id: "openai-gpt-4o", provider: "openai", apiKey: "key", model: "gpt-4o" }],
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

describe("OpenAIAdapter", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("supports a model id only when LLM_MODELS has a matching provider:\"openai\" entry", () => {
    expect(openAIProviderFactory.supports("openai-gpt-4o", config)).toBe(true);
    expect(openAIProviderFactory.supports("unknown-id", config)).toBe(false);
    expect(openAIProviderFactory.supports("openai-gpt-4o", { ...config, llmModels: [] })).toBe(false);
  });

  it("does not support an id whose LLM_MODELS entry belongs to a different provider", () => {
    const otherProviderConfig: Config = {
      ...config,
      llmModels: [
        { id: "openai-gpt-4o", provider: "azure", apiKey: "key", endpoint: "https://x.openai.azure.com", apiVersion: "2024-10-21", deployment: "d" },
      ],
    };
    expect(openAIProviderFactory.supports("openai-gpt-4o", otherProviderConfig)).toBe(false);
  });

  it("resolves two distinct models for two different LLM_MODELS entries", () => {
    const twoModelsConfig: Config = {
      ...config,
      llmModels: [...config.llmModels, { id: "openai-gpt-4o-mini", provider: "openai", apiKey: "key-2", model: "gpt-4o-mini" }],
    };

    const first = new OpenAIAdapter("openai-gpt-4o", twoModelsConfig);
    const second = new OpenAIAdapter("openai-gpt-4o-mini", twoModelsConfig);

    expect(first.modelId).toBe("openai-gpt-4o");
    expect(second.modelId).toBe("openai-gpt-4o-mini");
  });

  it("parses the model's JSON content into rawOutput", async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ merchant: "Acme", total: 42 }) } }],
    });

    const adapter = new OpenAIAdapter("openai-gpt-4o", config);
    const result = await adapter.extract({
      imageBase64: "AAA=",
      mimeType: "image/png",
      documentType: "ticket",
      jsonSchema: { type: "object" },
      fieldHints: { total: "importe total" },
    });

    expect(result.modelId).toBe("openai-gpt-4o");
    expect(result.rawOutput).toEqual({ merchant: "Acme", total: 42 });
    expect(createMock).toHaveBeenCalledTimes(1);
    const callArgs = createMock.mock.calls[0]![0];
    expect(callArgs.model).toBe("gpt-4o");
    expect(callArgs.response_format).toEqual({ type: "json_object" });
  });

  it("throws when the model returns no content", async () => {
    createMock.mockResolvedValue({ choices: [{ message: {} }] });
    const adapter = new OpenAIAdapter("openai-gpt-4o", config);

    await expect(
      adapter.extract({ imageBase64: "AAA=", mimeType: "image/png", documentType: "ticket", jsonSchema: {}, fieldHints: {} }),
    ).rejects.toThrow(/no content/);
  });

  it("throws when the model returns non-JSON content", async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: "not json" } }] });
    const adapter = new OpenAIAdapter("openai-gpt-4o", config);

    await expect(
      adapter.extract({ imageBase64: "AAA=", mimeType: "image/png", documentType: "ticket", jsonSchema: {}, fieldHints: {} }),
    ).rejects.toThrow(/not valid JSON/);
  });
});
