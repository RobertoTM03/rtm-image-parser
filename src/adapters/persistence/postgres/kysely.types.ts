import type { ColumnType, Generated, JSONColumnType } from "kysely";

export interface SchemaTemplatesTable {
  id: Generated<string>;
  name: string;
  description: string | null;
  schema: JSONColumnType<object>;
  field_hints: JSONColumnType<Record<string, string>>;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface SchemaDefinitionsTable {
  id: Generated<string>;
  document_type: string;
  version: number;
  based_on_template: string | null;
  schema: JSONColumnType<object>;
  field_hints: JSONColumnType<Record<string, string>>;
  active: boolean;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface ExtractionLogsTable {
  id: Generated<string>;
  document_type: string;
  schema_version: number;
  models_used: JSONColumnType<string[]>;
  models_dropped: JSONColumnType<Array<{ modelId: string; reason: string }>>;
  confidence: number | null;
  crosscheck_passed: boolean | null;
  processing_time_ms: number;
  status: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface Database {
  schema_templates: SchemaTemplatesTable;
  schema_definitions: SchemaDefinitionsTable;
  extraction_logs: ExtractionLogsTable;
}
