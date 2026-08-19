import { AzureOpenAI } from "openai";
import type {
  LLMVisionExtractionRequest,
  LLMVisionExtractionResponse,
  LLMVisionProviderPort,
} from "../../../domain/ports/llm-vision-provider.port";
import type { LLMProviderFactory } from "../../../domain/services/llm-provider-registry";
import type { Config } from "../../../config";

// Example EXTRACTION_MODELS labels — actual support is any "azure-*" prefix (see supports() below).
export const AZURE_OPENAI_SUPPORTED_MODELS = ["azure-gpt-4o"] as const;

function buildPrompt(request: LLMVisionExtractionRequest): string {
  const hints = Object.entries(request.fieldHints)
    .map(([field, hint]) => `- ${field}: ${hint}`)
    .join("\n");

  return [
    `Extract structured data from the attached "${request.documentType}" document image.`,
    `Respond ONLY with a single JSON object that matches this JSON Schema (no markdown fences, no explanation):`,
    JSON.stringify(request.jsonSchema, null, 2),
    hints ? `Field guidance:\n${hints}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export class AzureOpenAIAdapter implements LLMVisionProviderPort {
  private readonly client: AzureOpenAI;
  private readonly deploymentName: string;

  constructor(
    public readonly modelId: string,
    config: Config,
  ) {
    if (!config.azureOpenAI) {
      throw new Error(`AzureOpenAIAdapter requires config.azureOpenAI (model "${modelId}")`);
    }

    this.deploymentName = config.azureOpenAI.deploymentName;
    this.client = new AzureOpenAI({
      apiKey: config.azureOpenAI.apiKey,
      endpoint: config.azureOpenAI.endpoint,
      apiVersion: config.azureOpenAI.apiVersion,
      deployment: config.azureOpenAI.deploymentName,
      timeout: config.llmRequestTimeoutMs,
    });
  }

  async extract(request: LLMVisionExtractionRequest): Promise<LLMVisionExtractionResponse> {
    const startedAt = Date.now();

    const completion = await this.client.chat.completions.create({
      model: this.deploymentName,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a precise document data extraction engine." },
        {
          role: "user",
          content: [
            { type: "text", text: buildPrompt(request) },
            { type: "image_url", image_url: { url: `data:${request.mimeType};base64,${request.imageBase64}` } },
          ],
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`Azure OpenAI returned no content for model "${this.modelId}"`);
    }

    let rawOutput: unknown;
    try {
      rawOutput = JSON.parse(content);
    } catch {
      throw new Error(`Azure OpenAI response was not valid JSON for model "${this.modelId}"`);
    }

    return { modelId: this.modelId, rawOutput, latencyMs: Date.now() - startedAt };
  }
}

export const azureOpenAIProviderFactory: LLMProviderFactory = {
  supportedModelIds: AZURE_OPENAI_SUPPORTED_MODELS,
  // The modelId is just an EXTRACTION_MODELS label — any azure-* id routes to
  // the single deployment configured via AZURE_OPENAI_DEPLOYMENT_NAME.
  supports: (modelId) => modelId.startsWith("azure-"),
  create: (modelId, config) => new AzureOpenAIAdapter(modelId, config),
};
