import { createHash } from "node:crypto";
import type { LLMVisionProviderPort } from "../ports/llm-vision-provider.port";
import type { ExtractionLogRepositoryPort } from "../ports/extraction-log-repository.port";
import type { SchemaDefinition } from "../entities/schema-definition.entity";
import type { ExtractionMetadata, ExtractionResult, ModelDropped } from "../entities/extraction-result.entity";
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
      return {
        kind: "ok",
        data: cached.resultData!,
        metadata: {
          modelsUsed: cached.modelsUsed,
          modelsDropped: cached.modelsDropped,
          confidence: cached.confidence ?? 1,
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
      const metadata: ExtractionMetadata = {
        modelsUsed: [survivors[0]!.modelId],
        modelsDropped: dropped,
        confidence: 1,
        processingTimeMs,
        schemaVersion: schema.version,
        cached: false,
      };

      await this.logRepo.save({
        documentType: schema.documentType,
        schemaVersion: schema.version,
        modelsUsed: metadata.modelsUsed,
        modelsDropped: dropped,
        confidence: metadata.confidence,
        crosscheckPassed: null,
        processingTimeMs,
        status: "ok",
        imageHash,
        resultData: survivors[0]!.data,
      });

      return { kind: "ok", data: survivors[0]!.data, metadata };
    }

    // survivors preserves this.providers' order, i.e. EXTRACTION_MODELS order.
    const crosscheckResult = this.crosscheck.compare({
      results: survivors,
      schema: schema.schema,
      threshold: this.config.crosscheckThreshold,
      numericTolerance: this.config.crosscheckNumericTolerance,
    });

    const metadata: ExtractionMetadata = {
      modelsUsed: survivors.map((s) => s.modelId),
      modelsDropped: dropped,
      confidence: crosscheckResult.score,
      processingTimeMs,
      schemaVersion: schema.version,
      cached: false,
    };

    if (!crosscheckResult.passed) {
      await this.logRepo.save({
        documentType: schema.documentType,
        schemaVersion: schema.version,
        modelsUsed: metadata.modelsUsed,
        modelsDropped: dropped,
        confidence: metadata.confidence,
        crosscheckPassed: false,
        processingTimeMs,
        status: "discordant",
        imageHash,
        resultData: null,
      });

      return { kind: "discordant", score: crosscheckResult.score, mismatches: crosscheckResult.mismatches, metadata };
    }

    await this.logRepo.save({
      documentType: schema.documentType,
      schemaVersion: schema.version,
      modelsUsed: metadata.modelsUsed,
      modelsDropped: dropped,
      confidence: metadata.confidence,
      crosscheckPassed: true,
      processingTimeMs,
      status: "ok",
      imageHash,
      resultData: crosscheckResult.merged!,
    });

    return { kind: "ok", data: crosscheckResult.merged!, metadata };
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

        const validation = this.validateAgainstSchema(schema.schema, response.rawOutput);
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
