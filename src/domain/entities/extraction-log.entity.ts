import type { ModelDropped } from "./extraction-result.entity";

export interface ExtractionLog {
  documentType: string;
  schemaVersion: number;
  modelsUsed: string[];
  modelsDropped: ModelDropped[];
  confidence: number | null;
  crosscheckPassed: boolean | null;
  processingTimeMs: number;
  status: "ok" | "discordant" | "failed";
}

export interface ExtractionLogRecord extends ExtractionLog {
  id: string;
  createdAt: Date;
}
