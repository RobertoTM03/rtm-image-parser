export interface JSONSchemaFieldDef {
  type?: string;
  [key: string]: unknown;
}

function isNumericType(fieldSchema: JSONSchemaFieldDef | undefined): boolean {
  return fieldSchema?.type === "number" || fieldSchema?.type === "integer";
}

/**
 * Field-by-field equality used by the crosscheck service. Numbers compare
 * with a configurable relative tolerance; everything else (strings, enums,
 * booleans, objects, arrays) requires an exact match.
 */
export function compareField(a: unknown, b: unknown, fieldSchema: JSONSchemaFieldDef | undefined, numericTolerance: number): boolean {
  if (a === undefined || b === undefined) {
    return false;
  }

  if (isNumericType(fieldSchema)) {
    if (typeof a !== "number" || typeof b !== "number" || Number.isNaN(a) || Number.isNaN(b)) {
      return false;
    }
    const denominator = Math.max(Math.abs(a), Math.abs(b), 1e-9);
    return Math.abs(a - b) / denominator <= numericTolerance;
  }

  return JSON.stringify(a) === JSON.stringify(b);
}
