export interface ModelDropped {
  modelId: string;
  reason: string;
}

export interface ExtractionMetadata {
  modelsUsed: string[];
  modelsDropped: ModelDropped[];
  /** Schema fields (required or not) that ended up null in the returned data. Empty for "discordant". */
  missingFields: string[];
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
  matchRatio: number;
  mismatches: FieldMismatch[];
  metadata: ExtractionMetadata;
}

export interface ExtractionIncompleteResult {
  kind: "incomplete";
  data: Record<string, unknown>;
  /** Required fields no model could obtain. */
  missingFields: string[];
  metadata: ExtractionMetadata;
}

export type ExtractionResult = ExtractionOkResult | ExtractionDiscordantResult | ExtractionIncompleteResult;
