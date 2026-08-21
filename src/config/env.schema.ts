import { z } from "zod";

const azureModelSchema = z.object({
  id: z.string().min(1),
  provider: z.literal("azure"),
  apiKey: z.string().min(1),
  endpoint: z.string().min(1),
  apiVersion: z.string().min(1),
  deployment: z.string().min(1),
});

const openaiModelSchema = z.object({
  id: z.string().min(1),
  provider: z.literal("openai"),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

const geminiModelSchema = z.object({
  id: z.string().min(1),
  provider: z.literal("gemini"),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

const llmModelSchema = z.discriminatedUnion("provider", [azureModelSchema, openaiModelSchema, geminiModelSchema]);
const llmModelsArraySchema = z.array(llmModelSchema).superRefine((models, ctx) => {
  const seen = new Set<string>();
  for (const model of models) {
    if (seen.has(model.id)) {
      ctx.addIssue({ code: "custom", message: `Duplicate LLM_MODELS id "${model.id}"` });
    }
    seen.add(model.id);
  }
});

export type LLMModelConfig = z.infer<typeof llmModelSchema>;

/**
 * LLM_MODELS is a JSON array (see .env.example for the shape/comments) —
 * one self-contained connection per entry, each with its own credentials.
 */
const llmModelsEnvSchema = z.string().transform((value, ctx) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    ctx.addIssue({ code: "custom", message: "LLM_MODELS must be valid JSON (a single-line array of model objects)" });
    return z.NEVER;
  }

  const result = llmModelsArraySchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
    ctx.addIssue({ code: "custom", message: `LLM_MODELS is invalid: ${details}` });
    return z.NEVER;
  }

  return result.data;
});

const rawEnvSchema = z.object({
  EXTRACTION_MODELS: z.string().min(1, "EXTRACTION_MODELS must list at least one model id"),
  LLM_MODELS: llmModelsEnvSchema,

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

export const envSchema = rawEnvSchema;

export type RawEnv = z.infer<typeof rawEnvSchema>;
