import type { ExtractionLogRecord } from "../../../domain/entities/extraction-log.entity";

export interface ExtractionLogDto {
  id: string;
  documentType: string;
  schemaVersion: number;
  modelsUsed: string[];
  modelsDropped: Array<{ modelId: string; reason: string }>;
  crosscheckPassed: boolean | null;
  processingTimeMs: number;
  status: "ok" | "discordant" | "incomplete" | "failed";
  createdAt: string;
}

export function toExtractionLogDto(record: ExtractionLogRecord): ExtractionLogDto {
  return {
    id: record.id,
    documentType: record.documentType,
    schemaVersion: record.schemaVersion,
    modelsUsed: record.modelsUsed,
    modelsDropped: record.modelsDropped,
    crosscheckPassed: record.crosscheckPassed,
    processingTimeMs: record.processingTimeMs,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
  };
}
