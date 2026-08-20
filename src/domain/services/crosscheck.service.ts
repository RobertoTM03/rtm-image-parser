import { compareField } from "./field-comparator";
import type { JSONSchemaFieldDef } from "./field-comparator";
import type { FieldMismatch } from "../entities/extraction-result.entity";

export interface CrosscheckModelResult {
  modelId: string;
  data: Record<string, unknown>;
}

export interface CrosscheckInput {
  /** Pre-sorted in EXTRACTION_MODELS order. Must contain at least 2 entries. */
  results: CrosscheckModelResult[];
  schema: object;
  threshold: number;
  numericTolerance: number;
}

export interface CrosscheckOutput {
  passed: boolean;
  matchRatio: number;
  mismatches: FieldMismatch[];
  merged?: Record<string, unknown>;
}

interface JSONSchemaWithProperties {
  properties?: Record<string, JSONSchemaFieldDef>;
}

interface FieldEvaluation {
  field: string;
  matched: boolean;
  mismatchKind: "value_mismatch" | "missing_field";
  mergedValue: unknown;
  valuesByModel: Record<string, unknown>;
}

function firstDefinedValue(field: string, results: CrosscheckModelResult[]): unknown {
  return results.find((r) => r.data[field] !== undefined)?.data[field];
}

function evaluateField(field: string, fieldSchema: JSONSchemaFieldDef | undefined, results: CrosscheckModelResult[], numericTolerance: number): FieldEvaluation {
  const valuesByModel: Record<string, unknown> = {};
  for (const result of results) {
    valuesByModel[result.modelId] = result.data[field];
  }

  // No model returned this field: they agree it's absent, not a disagreement
  // to flag — the pipeline's own required-field check handles this case.
  if (results.every((r) => r.data[field] === undefined)) {
    return { field, matched: true, mismatchKind: "missing_field", mergedValue: undefined, valuesByModel };
  }

  const hasMissing = results.some((r) => r.data[field] === undefined);
  const fallbackValue = firstDefinedValue(field, results);

  if (results.length === 2) {
    const matched = compareField(results[0]!.data[field], results[1]!.data[field], fieldSchema, numericTolerance);
    return {
      field,
      matched,
      mismatchKind: hasMissing ? "missing_field" : "value_mismatch",
      mergedValue: fallbackValue,
      valuesByModel,
    };
  }

  // N >= 3: majority clustering — a value "wins" if more than half the models
  // agree on it. Models missing the field don't join any cluster.
  const clusters: Array<{ value: unknown; modelIds: string[] }> = [];
  for (const result of results) {
    if (result.data[field] === undefined) continue;
    const value = result.data[field];
    const cluster = clusters.find((c) => compareField(c.value, value, fieldSchema, numericTolerance));
    if (cluster) {
      cluster.modelIds.push(result.modelId);
    } else {
      clusters.push({ value, modelIds: [result.modelId] });
    }
  }

  const majority = clusters.find((c) => c.modelIds.length > results.length / 2);

  return {
    field,
    matched: Boolean(majority),
    mismatchKind: hasMissing ? "missing_field" : "value_mismatch",
    mergedValue: majority ? majority.value : fallbackValue,
    valuesByModel,
  };
}

/**
 * Compares schema-valid outputs from multiple models field by field. Only
 * called when >= 2 models survive per-model validation — single-model runs
 * skip crosscheck entirely (handled by the pipeline, not here).
 */
export class CrosscheckService {
  compare(input: CrosscheckInput): CrosscheckOutput {
    if (input.results.length < 2) {
      throw new Error("CrosscheckService.compare requires at least 2 results");
    }

    const properties = (input.schema as JSONSchemaWithProperties).properties ?? {};
    const fields = Object.keys(properties);

    if (fields.length === 0) {
      return { passed: true, matchRatio: 1, mismatches: [], merged: { ...input.results[0]!.data } };
    }

    const evaluations = fields.map((field) => evaluateField(field, properties[field], input.results, input.numericTolerance));

    const matchingCount = evaluations.filter((e) => e.matched).length;
    const matchRatio = matchingCount / fields.length;
    const passed = matchRatio >= input.threshold;

    if (!passed) {
      const mismatches: FieldMismatch[] = evaluations
        .filter((e) => !e.matched)
        .map((e) => ({ field: e.field, kind: e.mismatchKind, values: e.valuesByModel }));
      return { passed: false, matchRatio, mismatches };
    }

    const merged: Record<string, unknown> = {};
    for (const evaluation of evaluations) {
      merged[evaluation.field] = evaluation.mergedValue;
    }

    return { passed: true, matchRatio, mismatches: [], merged };
  }
}
