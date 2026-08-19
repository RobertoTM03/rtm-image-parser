import type { LLMVisionProviderPort } from "../ports/llm-vision-provider.port";
import type { Config } from "../../config";

export interface LLMProviderLogger {
  warn(message: string): void;
}

export interface LLMProviderFactory {
  /** Example ids, used only for warning/error messages — matching is done via `supports()`. */
  readonly supportedModelIds: readonly string[];
  /** Whether this factory can build a provider for the given EXTRACTION_MODELS entry. */
  supports(modelId: string): boolean;
  create(modelId: string, config: Config): LLMVisionProviderPort;
}

/**
 * Resolves the EXTRACTION_MODELS list (already parsed by config) against the
 * set of registered adapter factories. Runs once at startup (composition
 * root), never per-request. A modelId is just a label picked by whoever
 * configured EXTRACTION_MODELS (e.g. "azure-gpt-5.3-chat") — the actual
 * deployment/model called is whatever AZURE_OPENAI_DEPLOYMENT_NAME or
 * GEMINI_MODEL_NAME say, so any azure- or gemini- prefixed label routes to
 * that one configured deployment.
 */
export class LLMProviderRegistry {
  static resolve(
    requestedModelIds: string[],
    factories: LLMProviderFactory[],
    config: Config,
    logger: LLMProviderLogger,
  ): LLMVisionProviderPort[] {
    const exampleIds = factories.flatMap((f) => f.supportedModelIds);
    const providers: LLMVisionProviderPort[] = [];

    for (const modelId of requestedModelIds) {
      const factory = factories.find((f) => f.supports(modelId));
      if (!factory) {
        logger.warn(
          `Unsupported model "${modelId}" in EXTRACTION_MODELS — skipping. Examples of supported ids: ${exampleIds.join(", ")}`,
        );
        continue;
      }
      providers.push(factory.create(modelId, config));
    }

    if (providers.length === 0) {
      throw new Error(
        `No valid models resolved from EXTRACTION_MODELS. Examples of supported ids: ${exampleIds.join(", ")}`,
      );
    }

    return providers;
  }
}
