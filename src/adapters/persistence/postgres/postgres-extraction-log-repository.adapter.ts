import type { Kysely } from "kysely";
import type { ExtractionLogRepositoryPort } from "../../../domain/ports/extraction-log-repository.port";
import type { ExtractionLog, ExtractionLogRecord } from "../../../domain/entities/extraction-log.entity";
import type { Database } from "./kysely.types";

interface LogRow {
  id: string;
  document_type: string;
  schema_version: number;
  models_used: string[];
  models_dropped: Array<{ modelId: string; reason: string }>;
  confidence: string | number | null;
  crosscheck_passed: boolean | null;
  processing_time_ms: number;
  status: string;
  created_at: Date;
}

function toRecord(row: LogRow): ExtractionLogRecord {
  return {
    id: row.id,
    documentType: row.document_type,
    schemaVersion: row.schema_version,
    modelsUsed: row.models_used,
    modelsDropped: row.models_dropped,
    confidence: row.confidence === null ? null : Number(row.confidence),
    crosscheckPassed: row.crosscheck_passed,
    processingTimeMs: row.processing_time_ms,
    status: row.status as ExtractionLog["status"],
    createdAt: row.created_at,
  };
}

export class PostgresExtractionLogRepository implements ExtractionLogRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async save(log: ExtractionLog): Promise<void> {
    await this.db
      .insertInto("extraction_logs")
      .values({
        document_type: log.documentType,
        schema_version: log.schemaVersion,
        models_used: JSON.stringify(log.modelsUsed),
        models_dropped: JSON.stringify(log.modelsDropped),
        confidence: log.confidence,
        crosscheck_passed: log.crosscheckPassed,
        processing_time_ms: log.processingTimeMs,
        status: log.status,
      })
      .execute();
  }

  async findRecent(limit: number): Promise<ExtractionLogRecord[]> {
    const rows = await this.db
      .selectFrom("extraction_logs")
      .selectAll()
      .orderBy("created_at", "desc")
      .limit(limit)
      .execute();

    return rows.map((row) => toRecord(row as LogRow));
  }
}
