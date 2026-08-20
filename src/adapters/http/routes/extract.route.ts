import type { FastifyInstance, FastifyRequest } from "fastify";
import type { SchemaRegistryService } from "../../../domain/services/schema-registry.service";
import type { ExtractionPipelineService } from "../../../domain/services/extraction-pipeline.service";
import { DocumentTypeNotFoundError } from "../../../domain/errors/domain-errors";
import { extractJsonBodySchema, toMetadataDto } from "../dto/extract.dto";
import { validateImageInput } from "../image-input";
import type { ImageValidationConfig } from "../image-input";

export interface ExtractRouteDeps {
  schemaRegistry: SchemaRegistryService;
  pipeline: ExtractionPipelineService;
  imageValidation: ImageValidationConfig;
}

interface ParsedInput {
  imageBase64?: string;
  mimeType?: string;
  documentType?: string;
}

async function readInputFromRequest(request: FastifyRequest): Promise<ParsedInput> {
  if (request.isMultipart()) {
    let imageBase64: string | undefined;
    let mimeType: string | undefined;
    let documentType: string | undefined;

    for await (const part of request.parts()) {
      if (part.type === "file" && part.fieldname === "image") {
        const buffer = await part.toBuffer();
        imageBase64 = buffer.toString("base64");
        mimeType = part.mimetype;
      } else if (part.type === "field" && part.fieldname === "document_type") {
        documentType = String(part.value);
      }
    }

    return { imageBase64, mimeType, documentType };
  }

  const parsed = extractJsonBodySchema.safeParse(request.body);
  return parsed.success ? parsed.data : {};
}

export function registerExtractRoute(app: FastifyInstance, deps: ExtractRouteDeps): void {
  app.post("/v1/extract", async (request, reply) => {
    const input = await readInputFromRequest(request);

    const validationError = validateImageInput(input, deps.imageValidation);
    if (validationError) {
      reply.code(400).send({ error: validationError.code, message: validationError.message });
      return;
    }

    let activeSchema;
    try {
      activeSchema = await deps.schemaRegistry.getActiveSchema(input.documentType!);
    } catch (err) {
      if (err instanceof DocumentTypeNotFoundError) {
        reply.code(400).send({ error: "unknown_document_type", message: err.message });
        return;
      }
      throw err;
    }

    // Result caching by image hash (sha256 of the raw image bytes +
    // document_type + schema_version) if enabled happens inside the 
    // pipeline, which skips calling any LLM entirely on a cache hit.
    const result = await deps.pipeline.execute({
      imageBase64: input.imageBase64!,
      mimeType: input.mimeType!,
      activeSchema,
    });

    if (result.kind === "discordant") {
      reply.code(422).send({
        error: "crosscheck_discordant",
        matchRatio: result.matchRatio,
        mismatches: result.mismatches,
        metadata: toMetadataDto(result.metadata),
      });
      return;
    }

    if (result.kind === "incomplete") {
      reply.code(422).send({
        error: "missing_required_fields",
        data: result.data,
        missingFields: result.missingFields,
        metadata: toMetadataDto(result.metadata),
      });
      return;
    }

    reply.code(200).send({ data: result.data, metadata: toMetadataDto(result.metadata) });
  });
}
