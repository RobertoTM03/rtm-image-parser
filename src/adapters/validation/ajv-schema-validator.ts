import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { ValidateFunction } from "ajv";

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const compiledCache = new WeakMap<object, ValidateFunction>();

function compile(schema: object): ValidateFunction {
  const cached = compiledCache.get(schema);
  if (cached) return cached;
  const validateFn = ajv.compile(schema);
  compiledCache.set(schema, validateFn);
  return validateFn;
}

/**
 * Pure `(schema, data) => result` function injected into the domain
 * extraction pipeline, so the domain never imports ajv directly.
 */
export function validateAgainstSchema(schema: object, data: unknown): SchemaValidationResult {
  const validateFn = compile(schema);
  const valid = validateFn(data);
  return {
    valid: Boolean(valid),
    errors: (validateFn.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim()),
  };
}
