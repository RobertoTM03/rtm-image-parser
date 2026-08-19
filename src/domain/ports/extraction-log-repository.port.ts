import type { ExtractionLog, ExtractionLogRecord } from "../entities/extraction-log.entity";

export interface ExtractionLogRepositoryPort {
  save(log: ExtractionLog): Promise<void>;
  findRecent(limit: number): Promise<ExtractionLogRecord[]>;
}
