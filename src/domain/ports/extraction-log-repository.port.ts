import type { ExtractionLog, ExtractionLogRecord } from "../entities/extraction-log.entity";

export interface ExtractionLogPage {
  logs: ExtractionLogRecord[];
  hasMore: boolean;
}

export interface ExtractionLogRepositoryPort {
  save(log: ExtractionLog): Promise<void>;
  findRecent(limit: number, offset: number): Promise<ExtractionLogPage>;
  /** Most recent successful ("ok") log for this image/document type/schema version, if any. */
  findCachedResult(imageHash: string, documentType: string, schemaVersion: number): Promise<ExtractionLogRecord | null>;
}
