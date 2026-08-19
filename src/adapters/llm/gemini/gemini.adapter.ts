import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GenerativeModel } from "@google/generative-ai";
import type {
  LLMVisionExtractionRequest,
  LLMVisionExtractionResponse,
  LLMVisionProviderPort,
} from "../../../domain/ports/llm-vision-provider.port";
import type { LLMProviderFactory } from "../../../domain/services/llm-provider-registry";
import type { Config } from "../../../config";

// Example EXTRACTION_MODELS labels — actual support is any "gemini-*" prefix (see supports() below).
export const GEMINI_SUPPORTED_MODELS = ["gemini-1.5-pro", "gemini-1.5-flash"] as const;

function buildPrompt(request: LLMVisionExtractionRequest): string {
  const hints = Object.entries(request.fieldHints)
    .map(([field, hint]) => `- ${field}: ${hint}`)
    .join("\n");

  return [
    `Extract structured data from the attached "${request.documentType}" document image.`,
    `Respond ONLY with a single JSON object that matches this JSON Schema:`,
    JSON.stringify(request.jsonSchema, null, 2),
    hints ? `Field guidance:\n${hints}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export class GeminiAdapter implements LLMVisionProviderPort {
  private readonly model: GenerativeModel;
  private readonly timeoutMs: number;

  constructor(
    public readonly modelId: string,
    config: Config,
  ) {
    if (!config.gemini) {
      throw new Error(`GeminiAdapter requires config.gemini (model "${modelId}")`);
    }

    this.timeoutMs = config.llmRequestTimeoutMs;
    const client = new GoogleGenerativeAI(config.gemini.apiKey);
    this.model = client.getGenerativeModel({
      model: config.gemini.modelName,
      generationConfig: { responseMimeType: "application/json" },
    });
  }

  async extract(request: LLMVisionExtractionRequest): Promise<LLMVisionExtractionResponse> {
    const startedAt = Date.now();

    const result = await this.model.generateContent(
      {
        contents: [
          {
            role: "user",
            parts: [
              { text: buildPrompt(request) },
              { inlineData: { mimeType: request.mimeType, data: request.imageBase64 } },
            ],
          },
        ],
      },
      { timeout: this.timeoutMs },
    );

    const text = result.response.text();
    if (!text) {
      throw new Error(`Gemini returned no content for model "${this.modelId}"`);
    }

    let rawOutput: unknown;
    try {
      rawOutput = JSON.parse(text);
    } catch {
      throw new Error(`Gemini response was not valid JSON for model "${this.modelId}"`);
    }

    return { modelId: this.modelId, rawOutput, latencyMs: Date.now() - startedAt };
  }
}

export const geminiProviderFactory: LLMProviderFactory = {
  supportedModelIds: GEMINI_SUPPORTED_MODELS,
  supports: (modelId) => modelId.startsWith("gemini-"),
  create: (modelId, config) => new GeminiAdapter(modelId, config),
};
