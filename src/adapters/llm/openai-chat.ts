import type { LLMVisionExtractionRequest } from "../../domain/ports/llm-vision-provider.port";

/** Shared by the azure-openai and openai adapters — both call the same chat-completions shape. */
export function buildExtractionPrompt(request: LLMVisionExtractionRequest): string {
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

export function parseJsonChatCompletionContent(content: string | null | undefined, modelId: string, providerLabel: string): unknown {
  if (!content) {
    throw new Error(`${providerLabel} returned no content for model "${modelId}"`);
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`${providerLabel} response was not valid JSON for model "${modelId}"`);
  }
}
