import { describe, expect, it, vi } from "vitest";
import { LLMProviderRegistry } from "./llm-provider-registry";
import type { LLMProviderFactory } from "./llm-provider-registry";
import type { LLMVisionProviderPort } from "../ports/llm-vision-provider.port";
import type { Config } from "../../config";

function fakeProvider(modelId: string): LLMVisionProviderPort {
  return {
    modelId,
    extract: vi.fn(),
  };
}

function makeFactory(provider: string, supportedModelIds: string[]): LLMProviderFactory {
  return {
    provider,
    supports: (modelId) => supportedModelIds.includes(modelId),
    create: (modelId) => fakeProvider(modelId),
  };
}

const config = {} as Config;

describe("LLMProviderRegistry", () => {
  it("resolves all requested models when every one is supported", () => {
    const factories = [makeFactory("azure", ["azure-gpt-4o"]), makeFactory("gemini", ["gemini-1.5-pro"])];
    const logger = { warn: vi.fn() };

    const providers = LLMProviderRegistry.resolve(["azure-gpt-4o", "gemini-1.5-pro"], factories, config, logger);

    expect(providers.map((p) => p.modelId)).toEqual(["azure-gpt-4o", "gemini-1.5-pro"]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("skips an unsupported model, logs a warning, and keeps the rest", () => {
    const factories = [makeFactory("azure", ["azure-gpt-4o"]), makeFactory("gemini", ["gemini-1.5-pro"])];
    const logger = { warn: vi.fn() };

    const providers = LLMProviderRegistry.resolve(
      ["azure-gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro"],
      factories,
      config,
      logger,
    );

    expect(providers.map((p) => p.modelId)).toEqual(["azure-gpt-4o", "gemini-1.5-pro"]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0]![0]).toContain("claude-3-5-sonnet");
  });

  it("throws when every requested model is unsupported, listing what is supported", () => {
    const factories = [makeFactory("azure", ["azure-gpt-4o"]), makeFactory("gemini", ["gemini-1.5-pro"])];
    const logger = { warn: vi.fn() };

    expect(() => LLMProviderRegistry.resolve(["claude-3-5-sonnet"], factories, config, logger)).toThrow(
      /No valid models resolved/,
    );
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("resolves several models from the same provider independently", () => {
    const factories = [makeFactory("azure", ["azure-primary", "azure-secondary"])];
    const logger = { warn: vi.fn() };

    const providers = LLMProviderRegistry.resolve(["azure-primary", "azure-secondary"], factories, config, logger);

    expect(providers.map((p) => p.modelId)).toEqual(["azure-primary", "azure-secondary"]);
  });
});
