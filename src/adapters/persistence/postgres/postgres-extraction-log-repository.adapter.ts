import type { Kysely } from "kysely";
import type { ExtractionLogPage, ExtractionLogRepositoryPort } from "../../../domain/ports/extraction-log-repository.port";
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
  image_hash: string;
  result_data: Record<string, unknown> | null;
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
    imageHash: row.image_hash,
    resultData: row.result_data,
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
        image_hash: log.imageHash,
        result_data: log.resultData === null ? null : JSON.stringify(log.resultData),
      })
      .execute();
  }

  async findRecent(limit: number, offset: number): Promise<ExtractionLogPage> {
    // Over-fetch by one row past the page boundary to detect "more pages"
    // without a separate COUNT(*) query.
    const rows = await this.db
      .selectFrom("extraction_logs")
      .selectAll()
      .orderBy("created_at", "desc")
      .limit(limit + 1)
      .offset(offset)
      .execute();

    const hasMore = rows.length > limit;
    return {
      logs: rows.slice(0, limit).map((row) => toRecord(row as LogRow)),
      hasMore,
    };
  }

  async findCachedResult(
    imageHash: string,
    documentType: string,
    schemaVersion: number,
  ): Promise<ExtractionLogRecord | null> {
    const row = await this.db
      .selectFrom("extraction_logs")
      .selectAll()
      .where("image_hash", "=", imageHash)
      .where("document_type", "=", documentType)
      .where("schema_version", "=", schemaVersion)
      .where("status", "=", "ok")
      .orderBy("created_at", "desc")
      .limit(1)
      .executeTakeFirst();

    return row ? toRecord(row as LogRow) : null;
  }
}
