import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("openai", () => {
  class AzureOpenAI {
    chat = { completions: { create: createMock } };
    constructor(_opts: unknown) {}
  }
  return { AzureOpenAI };
});

import { AzureOpenAIAdapter, azureOpenAIProviderFactory, AZURE_OPENAI_SUPPORTED_MODELS } from "./azure-openai.adapter";
import type { Config } from "../../../config";

const config: Config = {
  extractionModelIds: ["azure-gpt-4o"],
  azureOpenAI: {
    apiKey: "key",
    endpoint: "https://example.openai.azure.com",
    apiVersion: "2024-10-21",
    deploymentName: "gpt-4o-deployment",
  },
  gemini: null,
  crosscheckThreshold: 0.9,
  crosscheckNumericTolerance: 0.01,
  maxRetriesPerModel: 2,
  llmRequestTimeoutMs: 30000,
  maxImageSizeBytes: 10 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg"],
  databaseUrl: "postgresql://x",
  port: 3000,
};

describe("AzureOpenAIAdapter", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("declares azure-gpt-4o as an example supported id", () => {
    expect(AZURE_OPENAI_SUPPORTED_MODELS).toContain("azure-gpt-4o");
  });

  it("supports any azure-* labeled model id, not just the example one", () => {
    expect(azureOpenAIProviderFactory.supports("azure-gpt-4o")).toBe(true);
    expect(azureOpenAIProviderFactory.supports("azure-gpt-5.3-chat")).toBe(true);
    expect(azureOpenAIProviderFactory.supports("gpt-5.3-chat")).toBe(false);
    expect(azureOpenAIProviderFactory.supports("gemini-1.5-pro")).toBe(false);
  });

  it("parses the model's JSON content into rawOutput", async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ merchant: "Acme", total: 42 }) } }],
    });

    const adapter = new AzureOpenAIAdapter("azure-gpt-4o", config);
    const result = await adapter.extract({
      imageBase64: "AAA=",
      mimeType: "image/png",
      documentType: "ticket",
      jsonSchema: { type: "object" },
      fieldHints: { total: "importe total" },
    });

    expect(result.modelId).toBe("azure-gpt-4o");
    expect(result.rawOutput).toEqual({ merchant: "Acme", total: 42 });
    expect(createMock).toHaveBeenCalledTimes(1);
    const callArgs = createMock.mock.calls[0]![0];
    expect(callArgs.model).toBe("gpt-4o-deployment");
    expect(callArgs.response_format).toEqual({ type: "json_object" });
  });

  it("throws when the model returns no content", async () => {
    createMock.mockResolvedValue({ choices: [{ message: {} }] });
    const adapter = new AzureOpenAIAdapter("azure-gpt-4o", config);

    await expect(
      adapter.extract({ imageBase64: "AAA=", mimeType: "image/png", documentType: "ticket", jsonSchema: {}, fieldHints: {} }),
    ).rejects.toThrow(/no content/);
  });

  it("throws when the model returns non-JSON content", async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: "not json" } }] });
    const adapter = new AzureOpenAIAdapter("azure-gpt-4o", config);

    await expect(
      adapter.extract({ imageBase64: "AAA=", mimeType: "image/png", documentType: "ticket", jsonSchema: {}, fieldHints: {} }),
    ).rejects.toThrow(/not valid JSON/);
  });
});
