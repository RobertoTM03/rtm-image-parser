import { OpenAI } from "openai";
import type {
  LLMVisionExtractionRequest,
  LLMVisionExtractionResponse,
  LLMVisionProviderPort,
} from "../../../domain/ports/llm-vision-provider.port";
import type { LLMProviderFactory } from "../../../domain/services/llm-provider-registry";
import type { Config, LLMModelConfig } from "../../../config";
import { buildExtractionPrompt, parseJsonChatCompletionContent } from "../openai-chat";

type OpenAIModelConfig = Extract<LLMModelConfig, { provider: "openai" }>;

function findEntry(modelId: string, config: Config): OpenAIModelConfig | undefined {
  return config.llmModels.find((m): m is OpenAIModelConfig => m.id === modelId && m.provider === "openai");
}

export class OpenAIAdapter implements LLMVisionProviderPort {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(
    public readonly modelId: string,
    config: Config,
  ) {
    const entry = findEntry(modelId, config);
    if (!entry) {
      throw new Error(`OpenAIAdapter: no LLM_MODELS entry for "${modelId}" with provider "openai"`);
    }

    this.model = entry.model;
    this.client = new OpenAI({ apiKey: entry.apiKey, timeout: config.llmRequestTimeoutMs });
  }

  async extract(request: LLMVisionExtractionRequest): Promise<LLMVisionExtractionResponse> {
    const startedAt = Date.now();

    const completion = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a precise document data extraction engine." },
        {
          role: "user",
          content: [
            { type: "text", text: buildExtractionPrompt(request) },
            { type: "image_url", image_url: { url: `data:${request.mimeType};base64,${request.imageBase64}` } },
          ],
        },
      ],
    });

    const rawOutput = parseJsonChatCompletionContent(completion.choices[0]?.message?.content, this.modelId, "OpenAI");
    return { modelId: this.modelId, rawOutput, latencyMs: Date.now() - startedAt };
  }
}

export const openAIProviderFactory: LLMProviderFactory = {
  provider: "openai",
  supports: (modelId, config) => findEntry(modelId, config) !== undefined,
  create: (modelId, config) => new OpenAIAdapter(modelId, config),
};
