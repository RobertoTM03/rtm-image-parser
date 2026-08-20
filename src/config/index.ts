import "dotenv/config";
import { envSchema } from "./env.schema";

export interface AzureOpenAIConfig {
  apiKey: string;
  endpoint: string;
  apiVersion: string;
  deploymentName: string;
}

export interface GeminiConfig {
  apiKey: string;
  modelName: string;
}

export interface Config {
  extractionModelIds: string[];
  azureOpenAI: AzureOpenAIConfig | null;
  gemini: GeminiConfig | null;
  crosscheckThreshold: number;
  crosscheckNumericTolerance: number;
  maxRetriesPerModel: number;
  llmRequestTimeoutMs: number;
  maxImageSizeBytes: number;
  allowedMimeTypes: string[];
  cacheEnabled: boolean;
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

  const needsAzure = modelIds.some((id) => id.startsWith("azure-"));
  const needsGemini = modelIds.some((id) => id.startsWith("gemini-"));

  return {
    extractionModelIds: modelIds,
    azureOpenAI: needsAzure
      ? {
          apiKey: data.AZURE_OPENAI_API_KEY!,
          endpoint: data.AZURE_OPENAI_ENDPOINT!,
          apiVersion: data.AZURE_OPENAI_API_VERSION!,
          deploymentName: data.AZURE_OPENAI_DEPLOYMENT_NAME!,
        }
      : null,
    gemini: needsGemini
      ? {
          apiKey: data.GEMINI_API_KEY!,
          modelName: data.GEMINI_MODEL_NAME!,
        }
      : null,
    crosscheckThreshold: data.CROSSCHECK_THRESHOLD,
    crosscheckNumericTolerance: data.CROSSCHECK_NUMERIC_TOLERANCE,
    maxRetriesPerModel: data.MAX_RETRIES_PER_MODEL,
    llmRequestTimeoutMs: data.LLM_REQUEST_TIMEOUT_MS,
    maxImageSizeBytes: Math.round(data.MAX_IMAGE_SIZE_MB * 1024 * 1024),
    allowedMimeTypes: data.ALLOWED_MIME_TYPES.split(",").map((entry) => entry.trim()).filter(Boolean),
    cacheEnabled: data.CACHE_ENABLED,
    databaseUrl: data.DATABASE_URL,
    port: data.PORT,
  };
}
