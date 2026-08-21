import "dotenv/config";
import { envSchema } from "./env.schema";
import type { LLMModelConfig } from "./env.schema";

export type { LLMModelConfig } from "./env.schema";

export interface Config {
  extractionModelIds: string[];
  llmModels: LLMModelConfig[];
  crosscheckThreshold: number;
  crosscheckNumericTolerance: number;
  maxRetriesPerModel: number;
  llmRequestTimeoutMs: number;
  maxImageSizeBytes: number;
  allowedMimeTypes: string[];
  cacheEnabled: boolean;
  maxHistoryPageSize: number;
  databaseUrl: string;
  port: number;
}

/**
 * The only module in the codebase allowed to read `process.env`. Every other
 * module receives a typed `Config` object via constructor/composition-root
 * injection.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const data = parsed.data;
  const modelIds = data.EXTRACTION_MODELS.split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return {
    extractionModelIds: modelIds,
    llmModels: data.LLM_MODELS,
    crosscheckThreshold: data.CROSSCHECK_THRESHOLD,
    crosscheckNumericTolerance: data.CROSSCHECK_NUMERIC_TOLERANCE,
    maxRetriesPerModel: data.MAX_RETRIES_PER_MODEL,
    llmRequestTimeoutMs: data.LLM_REQUEST_TIMEOUT_MS,
    maxImageSizeBytes: Math.round(data.MAX_IMAGE_SIZE_MB * 1024 * 1024),
    allowedMimeTypes: data.ALLOWED_MIME_TYPES.split(",").map((entry) => entry.trim()).filter(Boolean),
    cacheEnabled: data.CACHE_ENABLED,
    maxHistoryPageSize: data.MAX_HISTORY_PAGE_SIZE,
    databaseUrl: data.DATABASE_URL,
    port: data.PORT,
  };
}
