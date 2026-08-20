import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import cors from "@fastify/cors";
import type { Config } from "./config";
import type { SchemaRegistryService } from "./domain/services/schema-registry.service";
import type { ExtractionPipelineService } from "./domain/services/extraction-pipeline.service";
import type { ExtractionLogRepositoryPort } from "./domain/ports/extraction-log-repository.port";
import { registerErrorHandler } from "./adapters/http/plugins/error-handler.plugin";
import { registerAuthPlaceholder } from "./adapters/http/plugins/auth.placeholder";
import { registerHealthRoute } from "./adapters/http/routes/health.route";
import { registerTemplatesRoute } from "./adapters/http/routes/templates.route";
import { registerSchemasRoute } from "./adapters/http/routes/schemas.route";
import { registerExtractRoute } from "./adapters/http/routes/extract.route";
import { registerExtractionLogsRoute } from "./adapters/http/routes/extraction-logs.route";

export interface AppDependencies {
  config: Config;
  schemaRegistry: SchemaRegistryService;
  pipeline: ExtractionPipelineService;
  extractionLogRepository: ExtractionLogRepositoryPort;
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  // No auth is implemented yet (see auth.placeholder.ts), so CORS is left
  // open to any origin for this phase — tighten this once auth exists.
  await app.register(cors, { origin: true });

  await app.register(multipart, {
    limits: { fileSize: deps.config.maxImageSizeBytes },
  });

  registerErrorHandler(app);
  registerAuthPlaceholder(app);

  registerHealthRoute(app);
  registerTemplatesRoute(app, deps.schemaRegistry);
  registerSchemasRoute(app, deps.schemaRegistry);
  registerExtractionLogsRoute(app, deps.extractionLogRepository, deps.config.maxHistoryPageSize);
  registerExtractRoute(app, {
    schemaRegistry: deps.schemaRegistry,
    pipeline: deps.pipeline,
    imageValidation: {
      maxImageSizeBytes: deps.config.maxImageSizeBytes,
      allowedMimeTypes: deps.config.allowedMimeTypes,
    },
  });

  return app;
}
