import { describe, expect, it } from "vitest";
import { loadConfig } from "./index";

const geminiModel = { id: "gemini-1.5-pro", provider: "gemini", apiKey: "gemini-key", model: "gemini-1.5-pro" };

const baseEnv = {
  EXTRACTION_MODELS: "gemini-1.5-pro",
  LLM_MODELS: JSON.stringify([geminiModel]),
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
};

describe("loadConfig", () => {
  it("parses a valid environment and applies defaults", () => {
    const config = loadConfig(baseEnv);

    expect(config.extractionModelIds).toEqual(["gemini-1.5-pro"]);
    expect(config.llmModels).toEqual([geminiModel]);
    expect(config.crosscheckThreshold).toBe(0.9);
    expect(config.crosscheckNumericTolerance).toBe(0.01);
    expect(config.maxRetriesPerModel).toBe(2);
    expect(config.maxImageSizeBytes).toBe(10 * 1024 * 1024);
    expect(config.allowedMimeTypes).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(config.port).toBe(3000);
    expect(config.cacheEnabled).toBe(true);
    expect(config.maxHistoryPageSize).toBe(50);
  });

  it("disables caching only when CACHE_ENABLED is exactly \"false\"", () => {
    expect(loadConfig({ ...baseEnv, CACHE_ENABLED: "false" }).cacheEnabled).toBe(false);
    expect(loadConfig({ ...baseEnv, CACHE_ENABLED: "FALSE" }).cacheEnabled).toBe(false);
    expect(loadConfig({ ...baseEnv, CACHE_ENABLED: "true" }).cacheEnabled).toBe(true);
    expect(loadConfig(baseEnv).cacheEnabled).toBe(true);
  });

  it("overrides the extraction-log page size cap via MAX_HISTORY_PAGE_SIZE", () => {
    expect(loadConfig({ ...baseEnv, MAX_HISTORY_PAGE_SIZE: "100" }).maxHistoryPageSize).toBe(100);
  });

  it("throws when DATABASE_URL is missing", () => {
    const { DATABASE_URL, ...rest } = baseEnv;
    expect(() => loadConfig(rest)).toThrow(/DATABASE_URL/);
  });

  it("throws when LLM_MODELS is not valid JSON", () => {
    expect(() => loadConfig({ ...baseEnv, LLM_MODELS: "not json" })).toThrow(/LLM_MODELS must be valid JSON/);
  });

  it("throws when an LLM_MODELS entry has an unknown provider", () => {
    expect(() =>
      loadConfig({ ...baseEnv, LLM_MODELS: JSON.stringify([{ id: "x", provider: "claude", apiKey: "k" }]) }),
    ).toThrow(/LLM_MODELS is invalid/);
  });

  it("throws when an LLM_MODELS azure entry is missing a required field", () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        LLM_MODELS: JSON.stringify([{ id: "x", provider: "azure", apiKey: "k", endpoint: "https://x" }]),
      }),
    ).toThrow(/LLM_MODELS is invalid/);
  });

  it("throws when two LLM_MODELS entries share the same id", () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        LLM_MODELS: JSON.stringify([geminiModel, geminiModel]),
      }),
    ).toThrow(/Duplicate LLM_MODELS id/);
  });

  it("supports several models from the same provider, each with its own credentials", () => {
    const azurePrimary = {
      id: "azure-primary",
      provider: "azure",
      apiKey: "key-1",
      endpoint: "https://one.openai.azure.com",
      apiVersion: "2024-10-21",
      deployment: "gpt-4o-prod",
    };
    const azureSecondary = {
      id: "azure-secondary",
      provider: "azure",
      apiKey: "key-2",
      endpoint: "https://two.openai.azure.com",
      apiVersion: "2024-10-21",
      deployment: "gpt-4-turbo",
    };

    const config = loadConfig({
      EXTRACTION_MODELS: "azure-primary,azure-secondary",
      LLM_MODELS: JSON.stringify([azurePrimary, azureSecondary]),
      DATABASE_URL: baseEnv.DATABASE_URL,
    });

    expect(config.llmModels).toEqual([azurePrimary, azureSecondary]);
    expect(config.extractionModelIds).toEqual(["azure-primary", "azure-secondary"]);
  });
});
