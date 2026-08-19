export interface LLMVisionExtractionRequest {
  imageBase64: string;
  mimeType: string;
  documentType: string;
  jsonSchema: object;
  fieldHints: Record<string, string>;
}

export interface LLMVisionExtractionResponse {
  modelId: string;
  rawOutput: unknown;
  latencyMs: number;
}

/**
 * Contract every vision-capable LLM provider adapter must implement.
 * Implementations live under src/adapters/llm/** and must not leak
 * provider-specific types across this boundary.
 */
export interface LLMVisionProviderPort {
  readonly modelId: string;
  extract(request: LLMVisionExtractionRequest): Promise<LLMVisionExtractionResponse>;
}
