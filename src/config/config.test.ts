import { describe, expect, it } from "vitest";
import { loadConfig } from "./index";

const baseEnv = {
  EXTRACTION_MODELS: "gemini-1.5-pro",
  GEMINI_API_KEY: "gemini-key",
  GEMINI_MODEL_NAME: "gemini-1.5-pro",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
};

describe("loadConfig", () => {
  it("parses a valid environment and applies defaults", () => {
    const config = loadConfig(baseEnv);

    expect(config.extractionModelIds).toEqual(["gemini-1.5-pro"]);
    expect(config.gemini).toEqual({ apiKey: "gemini-key", modelName: "gemini-1.5-pro" });
    expect(config.azureOpenAI).toBeNull();
    expect(config.crosscheckThreshold).toBe(0.9);
    expect(config.crosscheckNumericTolerance).toBe(0.01);
    expect(config.maxRetriesPerModel).toBe(2);
    expect(config.maxImageSizeBytes).toBe(10 * 1024 * 1024);
    expect(config.allowedMimeTypes).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(config.port).toBe(3000);
    expect(config.cacheEnabled).toBe(true);
  });

  it("disables caching only when CACHE_ENABLED is exactly \"false\"", () => {
    expect(loadConfig({ ...baseEnv, CACHE_ENABLED: "false" }).cacheEnabled).toBe(false);
    expect(loadConfig({ ...baseEnv, CACHE_ENABLED: "FALSE" }).cacheEnabled).toBe(false);
    expect(loadConfig({ ...baseEnv, CACHE_ENABLED: "true" }).cacheEnabled).toBe(true);
    expect(loadConfig(baseEnv).cacheEnabled).toBe(true);
  });

  it("throws when DATABASE_URL is missing", () => {
    const { DATABASE_URL, ...rest } = baseEnv;
    expect(() => loadConfig(rest)).toThrow(/DATABASE_URL/);
  });

  it("throws when an azure-* model is active but azure credentials are missing", () => {
    expect(() =>
      loadConfig({
        EXTRACTION_MODELS: "azure-gpt-4o",
        DATABASE_URL: baseEnv.DATABASE_URL,
      }),
    ).toThrow(/AZURE_OPENAI_API_KEY/);
  });

  it("throws when a gemini-* model is active but gemini credentials are missing", () => {
    expect(() =>
      loadConfig({
        EXTRACTION_MODELS: "gemini-1.5-pro",
        DATABASE_URL: baseEnv.DATABASE_URL,
      }),
    ).toThrow(/GEMINI_API_KEY/);
  });

  it("resolves both provider configs when both families are active", () => {
    const config = loadConfig({
      EXTRACTION_MODELS: "azure-gpt-4o,gemini-1.5-pro",
      AZURE_OPENAI_API_KEY: "azure-key",
      AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
      AZURE_OPENAI_API_VERSION: "2024-10-21",
      AZURE_OPENAI_DEPLOYMENT_NAME: "gpt-4o-deployment",
      GEMINI_API_KEY: "gemini-key",
      GEMINI_MODEL_NAME: "gemini-1.5-pro",
      DATABASE_URL: baseEnv.DATABASE_URL,
    });

    expect(config.azureOpenAI).not.toBeNull();
    expect(config.gemini).not.toBeNull();
    expect(config.extractionModelIds).toEqual(["azure-gpt-4o", "gemini-1.5-pro"]);
  });

  it("does not require credentials for a provider family that is not active", () => {
    const config = loadConfig({
      EXTRACTION_MODELS: "gemini-1.5-pro",
      GEMINI_API_KEY: "gemini-key",
      GEMINI_MODEL_NAME: "gemini-1.5-pro",
      DATABASE_URL: baseEnv.DATABASE_URL,
    });

    expect(config.azureOpenAI).toBeNull();
  });
});
