import type { FastifyInstance } from "fastify";
import type { SchemaRegistryService } from "../../../domain/services/schema-registry.service";
import { createSchemaBodySchema, toSchemaDefinitionDto, updateSchemaBodySchema } from "../dto/schema.dto";

export function registerSchemasRoute(app: FastifyInstance, schemaRegistry: SchemaRegistryService): void {
  app.get("/v1/schemas", async () => {
    const definitions = await schemaRegistry.listActiveSchemas();
    return { schemas: definitions.map(toSchemaDefinitionDto) };
  });

  app.post("/v1/schemas", async (request, reply) => {
    const parsed = createSchemaBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "ValidationError", message: parsed.error.message, issues: parsed.error.issues });
      return;
    }

    const def = await schemaRegistry.createSchema({
      documentType: parsed.data.documentType,
      basedOnTemplate: parsed.data.basedOnTemplate,
      schema: parsed.data.schema as object | undefined,
      fieldHints: parsed.data.fieldHints,
    });

    reply.code(201).send(toSchemaDefinitionDto(def));
  });

  app.get<{ Params: { document_type: string } }>("/v1/schemas/:document_type", async (request, reply) => {
    const def = await schemaRegistry.getActiveSchema(request.params.document_type);
    reply.send(toSchemaDefinitionDto(def));
  });

  app.put<{ Params: { document_type: string } }>("/v1/schemas/:document_type", async (request, reply) => {
    const parsed = updateSchemaBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "ValidationError", message: parsed.error.message, issues: parsed.error.issues });
      return;
    }

    const def = await schemaRegistry.updateSchema(request.params.document_type, {
      schema: parsed.data.schema as object | undefined,
      fieldHints: parsed.data.fieldHints,
    });

    reply.send(toSchemaDefinitionDto(def));
  });

  app.get<{ Params: { document_type: string } }>("/v1/schemas/:document_type/versions", async (request, reply) => {
    const versions = await schemaRegistry.listVersions(request.params.document_type);
    reply.send({ versions: versions.map(toSchemaDefinitionDto) });
  });
}
