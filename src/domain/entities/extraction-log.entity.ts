import type { ModelDropped } from "./extraction-result.entity";

export interface ExtractionLog {
  documentType: string;
  schemaVersion: number;
  modelsUsed: string[];
  modelsDropped: ModelDropped[];
  crosscheckPassed: boolean | null;
  processingTimeMs: number;
  status: "ok" | "discordant" | "incomplete" | "failed";
  imageHash: string;
  /** Only set for "ok" results — the winning data, kept around for cache hits. */
  resultData: Record<string, unknown> | null;
}

export interface ExtractionLogRecord extends ExtractionLog {
  id: string;
  createdAt: Date;
}
