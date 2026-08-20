import Ajv from "ajv";

export interface SchemaTextValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  parsed?: Record<string, unknown>;
}

/**
 * Validates that `text` is both syntactically valid JSON and a structurally
 * valid JSON Schema document (checked against the JSON Schema meta-schema,
 * plus a compile attempt to catch things the meta-schema misses, like
 * invalid regex patterns or dangling $refs).
 */
export function validateSchemaText(text: string): SchemaTextValidation {
  const trimmed = text.trim();
  if (!trimmed) {
    return { valid: true, errors: [], warnings: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return { valid: false, errors: [`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`], warnings: [] };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { valid: false, errors: ["The schema must be a JSON object"], warnings: [] };
  }

  // Fresh instance per call: avoids "duplicate $id" errors from repeated
  // compiles of schemas that declare their own $id.
  const ajv = new Ajv({ allErrors: true, strict: false });

  const isValidMeta = ajv.validateSchema(parsed);
  if (!isValidMeta) {
    const errors = (ajv.errors ?? []).map((e) => `${e.instancePath || e.schemaPath} ${e.message ?? ""}`.trim());
    return { valid: false, errors: errors.length ? errors : ["Not a valid JSON Schema"], warnings: [] };
  }

  try {
    ajv.compile(parsed as object);
  } catch (err) {
    return { valid: false, errors: [`Schema cannot be compiled: ${err instanceof Error ? err.message : String(err)}`], warnings: [] };
  }

  const warnings: string[] = [];
  const rootType = (parsed as Record<string, unknown>).type;
  if (rootType !== undefined && rootType !== "object") {
    warnings.push('Document schemas usually have "type": "object" at the root.');
  }

  return { valid: true, errors: [], warnings, parsed: parsed as Record<string, unknown> };
}
