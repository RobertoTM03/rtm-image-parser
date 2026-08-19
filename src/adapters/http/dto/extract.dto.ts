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
  confidence: number;
  processingTimeMs: number;
  schemaVersion: number;
}

export function toMetadataDto(metadata: ExtractionMetadata): ExtractionMetadataDto {
  return {
    modelsUsed: metadata.modelsUsed,
    modelsDropped: metadata.modelsDropped,
    confidence: metadata.confidence,
    processingTimeMs: metadata.processingTimeMs,
    schemaVersion: metadata.schemaVersion,
  };
}

export interface DiscordantResponseDto {
  error: "crosscheck_discordant";
  score: number;
  mismatches: FieldMismatch[];
  metadata: ExtractionMetadataDto;
}
