import { z } from "zod";

const rawEnvSchema = z.object({
  EXTRACTION_MODELS: z.string().min(1, "EXTRACTION_MODELS must list at least one model id"),

  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_ENDPOINT: z.string().optional(),
  AZURE_OPENAI_API_VERSION: z.string().optional(),
  AZURE_OPENAI_DEPLOYMENT_NAME: z.string().optional(),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL_NAME: z.string().optional(),

  CROSSCHECK_THRESHOLD: z.coerce.number().min(0).max(1).default(0.9),
  CROSSCHECK_NUMERIC_TOLERANCE: z.coerce.number().min(0).default(0.01),
  MAX_RETRIES_PER_MODEL: z.coerce.number().int().min(0).default(2),

  LLM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  MAX_IMAGE_SIZE_MB: z.coerce.number().positive().default(10),
  ALLOWED_MIME_TYPES: z.string().default("image/jpeg,image/png,image/webp"),

  // Only the literal string "false" disables caching; anything else (including unset) keeps it on.
  CACHE_ENABLED: z
    .string()
    .default("true")
    .transform((value) => value.toLowerCase() !== "false"),

  // Upper bound the UI (or any client) can request per page from GET /v1/extraction-logs.
  MAX_HISTORY_PAGE_SIZE: z.coerce.number().int().positive().default(50),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  PORT: z.coerce.number().int().positive().default(3000),
});

const AZURE_REQUIRED_KEYS = [
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_API_VERSION",
  "AZURE_OPENAI_DEPLOYMENT_NAME",
] as const;

const GEMINI_REQUIRED_KEYS = ["GEMINI_API_KEY", "GEMINI_MODEL_NAME"] as const;

function splitModelIds(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Cross-field validation: EXTRACTION_MODELS drives which provider credentials
 * are actually required. Model-name *support* (recognized by an adapter) is
 * validated later by LLMProviderRegistry, since config has no knowledge of
 * which adapters exist.
 */
export const envSchema = rawEnvSchema.superRefine((env, ctx) => {
  const modelIds = splitModelIds(env.EXTRACTION_MODELS);

  const needsAzure = modelIds.some((id) => id.startsWith("azure-"));
  const needsGemini = modelIds.some((id) => id.startsWith("gemini-"));

  if (needsAzure) {
    for (const key of AZURE_REQUIRED_KEYS) {
      if (!env[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required because EXTRACTION_MODELS includes an azure-* model`,
        });
      }
    }
  }

  if (needsGemini) {
    for (const key of GEMINI_REQUIRED_KEYS) {
      if (!env[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required because EXTRACTION_MODELS includes a gemini-* model`,
        });
      }
    }
  }
});

export type RawEnv = z.infer<typeof rawEnvSchema>;
