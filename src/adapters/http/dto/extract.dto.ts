import { z } from "zod";
import type { ExtractionMetadata, FieldMismatch } from "../../../domain/entities/extraction-result.entity";

export const extractJsonBodySchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().min(1),
  documentType: z.string().min(1),
});

export type ExtractJsonBody = z.infer<typeof extractJsonBodySchema>;

export interface ExtractionMetadataDto {
  modelsUsed: string[];
  modelsDropped: Array<{ modelId: string; reason: string }>;
  missingFields: string[];
  processingTimeMs: number;
  schemaVersion: number;
  cached: boolean;
}

export function toMetadataDto(metadata: ExtractionMetadata): ExtractionMetadataDto {
  return {
    modelsUsed: metadata.modelsUsed,
    modelsDropped: metadata.modelsDropped,
    missingFields: metadata.missingFields,
    processingTimeMs: metadata.processingTimeMs,
    schemaVersion: metadata.schemaVersion,
    cached: metadata.cached,
  };
}

export interface DiscordantResponseDto {
  error: "crosscheck_discordant";
  matchRatio: number;
  mismatches: FieldMismatch[];
  metadata: ExtractionMetadataDto;
}

export interface IncompleteResponseDto {
  error: "missing_required_fields";
  data: Record<string, unknown>;
  missingFields: string[];
  metadata: ExtractionMetadataDto;
}
