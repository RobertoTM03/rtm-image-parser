export interface ModelDropped {
  modelId: string;
  reason: string;
}

export interface ExtractionMetadata {
  modelsUsed: string[];
  modelsDropped: ModelDropped[];
  confidence: number;
  processingTimeMs: number;
  schemaVersion: number;
  /** True when this result was served from the image-hash cache without calling any LLM. */
  cached: boolean;
}

export interface FieldMismatch {
  field: string;
  kind: "value_mismatch" | "missing_field";
  values: Record<string, unknown>;
}

export interface ExtractionOkResult {
  kind: "ok";
  data: Record<string, unknown>;
  metadata: ExtractionMetadata;
}

export interface ExtractionDiscordantResult {
  kind: "discordant";
  score: number;
  mismatches: FieldMismatch[];
  metadata: ExtractionMetadata;
}

export type ExtractionResult = ExtractionOkResult | ExtractionDiscordantResult;
