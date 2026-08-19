import type { FastifyInstance } from "fastify";
import type { SchemaRegistryService } from "../../../domain/services/schema-registry.service";
import { toTemplateDto } from "../dto/template.dto";

export function registerTemplatesRoute(app: FastifyInstance, schemaRegistry: SchemaRegistryService): void {
  app.get("/v1/templates", async () => {
    const templates = await schemaRegistry.listTemplates();
    return { templates: templates.map(toTemplateDto) };
  });
}
