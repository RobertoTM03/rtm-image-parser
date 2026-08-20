import { createHash } from "node:crypto";
import type { LLMVisionProviderPort } from "../ports/llm-vision-provider.port";
import type { ExtractionLogRepositoryPort } from "../ports/extraction-log-repository.port";
import type { SchemaDefinition } from "../entities/schema-definition.entity";
import type {
  ExtractionIncompleteResult,
  ExtractionMetadata,
  ExtractionOkResult,
  ExtractionResult,
  ModelDropped,
} from "../entities/extraction-result.entity";
import { CrosscheckService } from "./crosscheck.service";
import { AllModelsFailedError } from "../errors/domain-errors";

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

export type SchemaValidator = (schema: object, data: unknown) => SchemaValidationResult;

export interface ExtractionPipelineConfig {
  maxRetriesPerModel: number;
  crosscheckThreshold: number;
  crosscheckNumericTolerance: number;
  cacheEnabled: boolean;
}

export interface ExtractPipelineInput {
  imageBase64: string;
  mimeType: string;
  /** Resolved by the HTTP boundary before the pipeline is invoked. */
  activeSchema: SchemaDefinition;
}

interface JSONSchemaWithProperties {
  properties?: Record<string, unknown>;
  required?: string[];
}

/** Root-level `required` is the only kind the UI's schema builder produces. */
function schemaWithoutRequired(schema: object): object {
  const { required: _required, ...rest } = schema as JSONSchemaWithProperties & Record<string, unknown>;
  return rest;
}

interface SchemaCompletion {
  data: Record<string, unknown>;
  /** Every schema field that ended up null, required or not. */
  missingFields: string[];
  /** Subset of missingFields that the schema marks required. */
  missingRequiredFields: string[];
}

/**
 * Fills every schema property into `data`, defaulting absent/null ones to
 * `null` so the caller always gets the full field set back, and reports
 * which ones were missing (and which of those were required).
 */
function completeAgainstSchema(schema: object, data: Record<string, unknown>): SchemaCompletion {
  const { properties = {}, required = [] } = schema as JSONSchemaWithProperties;
  const requiredSet = new Set(required);

  const complete: Record<string, unknown> = {};
  const missingFields: string[] = [];
  const missingRequiredFields: string[] = [];

  for (const field of Object.keys(properties)) {
    const value = data[field];
    if (value === undefined || value === null) {
      complete[field] = null;
      missingFields.push(field);
      if (requiredSet.has(field)) missingRequiredFields.push(field);
    } else {
      complete[field] = value;
    }
  }

  return { data: complete, missingFields, missingRequiredFields };
}

export class ExtractionPipelineService {
  constructor(
    private readonly providers: LLMVisionProviderPort[],
    private readonly crosscheck: CrosscheckService,
    private readonly validateAgainstSchema: SchemaValidator,
    private readonly logRepo: ExtractionLogRepositoryPort,
    private readonly config: ExtractionPipelineConfig,
  ) {}

  async execute(input: ExtractPipelineInput): Promise<ExtractionResult> {
    const startedAt = Date.now();
    const schema = input.activeSchema;
    const imageHash = createHash("sha256").update(Buffer.from(input.imageBase64, "base64")).digest("hex");

    const cached = this.config.cacheEnabled
      ? await this.logRepo.findCachedResult(imageHash, schema.documentType, schema.version)
      : null;
    if (cached) {
      const completion = completeAgainstSchema(schema.schema, cached.resultData!);
      return {
        kind: "ok",
        data: completion.data,
        metadata: {
          modelsUsed: cached.modelsUsed,
          modelsDropped: cached.modelsDropped,
          missingFields: completion.missingFields,
          processingTimeMs: 0,
          schemaVersion: cached.schemaVersion,
          cached: true,
        },
      };
    }

    const settled = await Promise.allSettled(
      this.providers.map((provider) => this.callWithRetry(provider, input, schema)),
    );

    const survivors: Array<{ modelId: string; data: Record<string, unknown> }> = [];
    const dropped: ModelDropped[] = [];

    settled.forEach((result, index) => {
      const provider = this.providers[index]!;
      if (result.status === "fulfilled") {
        survivors.push({ modelId: provider.modelId, data: result.value });
      } else {
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        dropped.push({ modelId: provider.modelId, reason });
      }
    });

    const processingTimeMs = Date.now() - startedAt;

    if (survivors.length === 0) {
      throw new AllModelsFailedError(dropped.map((d) => ({ modelId: d.modelId, reason: d.reason })));
    }

    if (survivors.length === 1) {
      // Single surviving model: crosscheck is skipped entirely.
      return this.finalizeResult(schema, survivors[0]!.data, {
        modelsUsed: [survivors[0]!.modelId],
        modelsDropped: dropped,
        processingTimeMs,
        imageHash,
        crosscheckPassed: null,
      });
    }

    // survivors preserves this.providers' order, i.e. EXTRACTION_MODELS order.
    const crosscheckResult = this.crosscheck.compare({
      results: survivors,
      schema: schema.schema,
      threshold: this.config.crosscheckThreshold,
      numericTolerance: this.config.crosscheckNumericTolerance,
    });

    if (!crosscheckResult.passed) {
      const metadata: ExtractionMetadata = {
        modelsUsed: survivors.map((s) => s.modelId),
        modelsDropped: dropped,
        missingFields: [],
        processingTimeMs,
        schemaVersion: schema.version,
        cached: false,
      };

      await this.logRepo.save({
        documentType: schema.documentType,
        schemaVersion: schema.version,
        modelsUsed: metadata.modelsUsed,
        modelsDropped: dropped,
        crosscheckPassed: false,
        processingTimeMs,
        status: "discordant",
        imageHash,
        resultData: null,
      });

      return { kind: "discordant", matchRatio: crosscheckResult.matchRatio, mismatches: crosscheckResult.mismatches, metadata };
    }

    return this.finalizeResult(schema, crosscheckResult.merged!, {
      modelsUsed: survivors.map((s) => s.modelId),
      modelsDropped: dropped,
      processingTimeMs,
      imageHash,
      crosscheckPassed: true,
    });
  }

  private async finalizeResult(
    schema: SchemaDefinition,
    rawData: Record<string, unknown>,
    save: {
      modelsUsed: string[];
      modelsDropped: ModelDropped[];
      processingTimeMs: number;
      imageHash: string;
      crosscheckPassed: boolean | null;
    },
  ): Promise<ExtractionOkResult | ExtractionIncompleteResult> {
    const completion = completeAgainstSchema(schema.schema, rawData);
    const metadata: ExtractionMetadata = {
      modelsUsed: save.modelsUsed,
      modelsDropped: save.modelsDropped,
      missingFields: completion.missingFields,
      processingTimeMs: save.processingTimeMs,
      schemaVersion: schema.version,
      cached: false,
    };

    const isIncomplete = completion.missingRequiredFields.length > 0;

    await this.logRepo.save({
      documentType: schema.documentType,
      schemaVersion: schema.version,
      modelsUsed: save.modelsUsed,
      modelsDropped: save.modelsDropped,
      crosscheckPassed: save.crosscheckPassed,
      processingTimeMs: save.processingTimeMs,
      status: isIncomplete ? "incomplete" : "ok",
      imageHash: save.imageHash,
      resultData: completion.data,
    });

    if (isIncomplete) {
      return { kind: "incomplete", data: completion.data, missingFields: completion.missingRequiredFields, metadata };
    }

    return { kind: "ok", data: completion.data, metadata };
  }

  private async callWithRetry(
    provider: LLMVisionProviderPort,
    input: ExtractPipelineInput,
    schema: SchemaDefinition,
  ): Promise<Record<string, unknown>> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.maxRetriesPerModel; attempt++) {
      try {
        const response = await provider.extract({
          imageBase64: input.imageBase64,
          mimeType: input.mimeType,
          documentType: schema.documentType,
          jsonSchema: schema.schema,
          fieldHints: schema.fieldHints,
        });

        const validation = this.validateAgainstSchema(schemaWithoutRequired(schema.schema), response.rawOutput);
        if (validation.valid) {
          return response.rawOutput as Record<string, unknown>;
        }

        lastError = new Error(`Schema validation failed: ${validation.errors.join("; ") || "unknown error"}`);
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
