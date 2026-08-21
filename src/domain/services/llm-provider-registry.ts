import type { LLMVisionProviderPort } from "../ports/llm-vision-provider.port";
import type { Config } from "../../config";

export interface LLMProviderLogger {
  warn(message: string): void;
}

export interface LLMProviderFactory {
  /** Provider discriminator (e.g. "azure"), used only for warning/error messages. */
  readonly provider: string;
  /** Whether this factory can build a provider for the given EXTRACTION_MODELS entry. */
  supports(modelId: string, config: Config): boolean;
  create(modelId: string, config: Config): LLMVisionProviderPort;
}

/**
 * Resolves the EXTRACTION_MODELS list (already parsed by config) against the
 * set of registered adapter factories. Runs once at startup (composition
 * root), never per-request. A modelId must have a matching entry in
 * config.llmModels — the entry's `provider` decides which factory builds it,
 * and its own fields (endpoint/deployment/model/...) decide what gets called.
 */
export class LLMProviderRegistry {
  static resolve(
    requestedModelIds: string[],
    factories: LLMProviderFactory[],
    config: Config,
    logger: LLMProviderLogger,
  ): LLMVisionProviderPort[] {
    const knownProviders = factories.map((f) => f.provider);
    const providers: LLMVisionProviderPort[] = [];

    for (const modelId of requestedModelIds) {
      const factory = factories.find((f) => f.supports(modelId, config));
      if (!factory) {
        logger.warn(
          `Unsupported model "${modelId}" in EXTRACTION_MODELS — no matching LLM_MODELS entry found. Known providers: ${knownProviders.join(", ")}`,
        );
        continue;
      }
      providers.push(factory.create(modelId, config));
    }

    if (providers.length === 0) {
      throw new Error(
        `No valid models resolved from EXTRACTION_MODELS. Known providers: ${knownProviders.join(", ")}`,
      );
    }

    return providers;
  }
}
