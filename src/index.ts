import { loadConfig } from "./config";
import { buildApp } from "./app";
import { createKyselyInstance } from "./adapters/persistence/postgres/kysely-client";
import { PostgresSchemaRepository } from "./adapters/persistence/postgres/postgres-schema-repository.adapter";
import { PostgresExtractionLogRepository } from "./adapters/persistence/postgres/postgres-extraction-log-repository.adapter";
import { validateAgainstSchema } from "./adapters/validation/ajv-schema-validator";
import { azureOpenAIProviderFactory } from "./adapters/llm/azure-openai/azure-openai.adapter";
import { openAIProviderFactory } from "./adapters/llm/openai/openai.adapter";
import { geminiProviderFactory } from "./adapters/llm/gemini/gemini.adapter";
import { SchemaRegistryService } from "./domain/services/schema-registry.service";
import { CrosscheckService } from "./domain/services/crosscheck.service";
import { ExtractionPipelineService } from "./domain/services/extraction-pipeline.service";
import { LLMProviderRegistry } from "./domain/services/llm-provider-registry";

async function main(): Promise<void> {
  const config = loadConfig();

  const db = createKyselyInstance(config.databaseUrl);
  const schemaRepository = new PostgresSchemaRepository(db);
  const extractionLogRepository = new PostgresExtractionLogRepository(db);
  const schemaRegistry = new SchemaRegistryService(schemaRepository);

  // Resolved once at startup — unsupported EXTRACTION_MODELS entries are
  // logged and skipped here, never re-evaluated per request.
  const providers = LLMProviderRegistry.resolve(
    config.extractionModelIds,
    [azureOpenAIProviderFactory, openAIProviderFactory, geminiProviderFactory],
    config,
    { warn: (message) => console.warn(`[llm-provider-registry] ${message}`) },
  );

  const pipeline = new ExtractionPipelineService(
    providers,
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

  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
