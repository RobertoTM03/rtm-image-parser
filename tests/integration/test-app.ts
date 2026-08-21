import "dotenv/config";
import { buildApp } from "../../src/app";
import type { Config } from "../../src/config";
import { createKyselyInstance } from "../../src/adapters/persistence/postgres/kysely-client";
import { PostgresSchemaRepository } from "../../src/adapters/persistence/postgres/postgres-schema-repository.adapter";
import { PostgresExtractionLogRepository } from "../../src/adapters/persistence/postgres/postgres-extraction-log-repository.adapter";
import { validateAgainstSchema } from "../../src/adapters/validation/ajv-schema-validator";
import { SchemaRegistryService } from "../../src/domain/services/schema-registry.service";
import { CrosscheckService } from "../../src/domain/services/crosscheck.service";
import { ExtractionPipelineService } from "../../src/domain/services/extraction-pipeline.service";
import type { LLMVisionProviderPort } from "../../src/domain/ports/llm-vision-provider.port";

export function getTestDatabaseUrl(): string | undefined {
  return process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
}

const testConfig: Omit<Config, "databaseUrl"> = {
  extractionModelIds: ["fake-model"],
  llmModels: [],
  crosscheckThreshold: 0.9,
  crosscheckNumericTolerance: 0.01,
  maxRetriesPerModel: 1,
  llmRequestTimeoutMs: 30000,
  maxImageSizeBytes: 10 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  cacheEnabled: true,
  maxHistoryPageSize: 50,
  port: 3000,
};

export async function buildTestApp(fakeProviders: LLMVisionProviderPort[] = []) {
  const databaseUrl = getTestDatabaseUrl();
  if (!databaseUrl) return null;

  const db = createKyselyInstance(databaseUrl);
  const config: Config = { ...testConfig, databaseUrl };

  const schemaRepository = new PostgresSchemaRepository(db);
  const extractionLogRepository = new PostgresExtractionLogRepository(db);
  const schemaRegistry = new SchemaRegistryService(schemaRepository);

  const pipeline = new ExtractionPipelineService(
    fakeProviders,
    new CrosscheckService(),
    validateAgainstSchema,
    extractionLogRepository,
    {
      maxRetriesPerModel: config.maxRetriesPerModel,
      crosscheckThreshold: config.crosscheckThreshold,
      crosscheckNumericTolerance: config.crosscheckNumericTolerance,
      cacheEnabled: config.cacheEnabled,
    },
  );

  const app = await buildApp({ config, schemaRegistry, pipeline, extractionLogRepository });
  return { app, db };
}
