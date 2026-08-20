export type PrimitiveType = "string" | "number" | "integer" | "boolean";
export type FieldType = PrimitiveType | "array" | "object";

export interface SchemaField {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
  description: string;
  /** Only meaningful when type === "string". */
  format: string;
  /** Comma-separated allowed values. Only meaningful for string/number/integer. */
  enumText: string;
  /** Only meaningful when type === "array": the type of each item. */
  itemType: PrimitiveType | "object";
  /** Object fields, used when type === "object", or when type === "array" && itemType === "object". */
  children: SchemaField[];
}

const PRIMITIVE_TYPES = new Set(["string", "number", "integer", "boolean"]);
const SUPPORTED_FORMATS = new Set(["date", "date-time", "email", "uri", "uuid"]);
const ROOT_KEYS = new Set(["type", "properties", "required", "description", "title", "$schema"]);
const OBJECT_KEYS = new Set(["type", "properties", "required", "description"]);
const ARRAY_KEYS = new Set(["type", "items", "description"]);
const PRIMITIVE_KEYS = new Set(["type", "format", "description", "enum"]);

let idCounter = 0;
export function nextFieldId(): string {
  idCounter += 1;
  return `f${idCounter}`;
}

export function emptyField(): SchemaField {
  return {
    id: nextFieldId(),
    name: "",
    type: "string",
    required: false,
    description: "",
    format: "",
    enumText: "",
    itemType: "string",
    children: [],
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---- fields -> JSON Schema -------------------------------------------------

function primitiveToSchema(field: SchemaField): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: field.type };
  if (field.type === "string" && field.format) schema.format = field.format;
  if (field.description.trim()) schema.description = field.description.trim();
  const values = field.enumText
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  if (values.length > 0) {
    schema.enum = field.type === "number" || field.type === "integer" ? values.map(Number) : values;
  }
  return schema;
}

function objectSchemaFromFields(fields: SchemaField[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const field of fields) {
    const name = field.name.trim();
    if (!name) continue;
    properties[name] = fieldToSchema(field);
    if (field.required) required.push(name);
  }
  const schema: Record<string, unknown> = { type: "object", properties };
  if (required.length > 0) schema.required = required;
  return schema;
}

function fieldToSchema(field: SchemaField): Record<string, unknown> {
  if (field.type === "object") {
    const schema = objectSchemaFromFields(field.children);
    if (field.description.trim()) schema.description = field.description.trim();
    return schema;
  }
  if (field.type === "array") {
    const items = field.itemType === "object" ? objectSchemaFromFields(field.children) : primitiveToSchema({ ...field, type: field.itemType });
    const schema: Record<string, unknown> = { type: "array", items };
    if (field.description.trim()) schema.description = field.description.trim();
    return schema;
  }
  return primitiveToSchema(field);
}

export function fieldsToJsonSchema(fields: SchemaField[]): Record<string, unknown> {
  return objectSchemaFromFields(fields);
}

// ---- JSON Schema -> fields (only for the subset the builder supports) -----

function isSupportedPrimitive(raw: Record<string, unknown>): boolean {
  if (typeof raw.type !== "string" || !PRIMITIVE_TYPES.has(raw.type)) return false;
  if (!Object.keys(raw).every((k) => PRIMITIVE_KEYS.has(k))) return false;
  if (raw.format !== undefined && (typeof raw.format !== "string" || !SUPPORTED_FORMATS.has(raw.format))) return false;
  if (raw.enum !== undefined && !Array.isArray(raw.enum)) return false;
  return true;
}

function isSupportedObject(raw: Record<string, unknown>, allowedKeys: Set<string>): boolean {
  if (!Object.keys(raw).every((k) => allowedKeys.has(k))) return false;
  if (raw.type !== undefined && raw.type !== "object") return false;
  if (raw.required !== undefined && !Array.isArray(raw.required)) return false;
  if (raw.properties === undefined) return true;
  if (!isPlainObject(raw.properties)) return false;
  return Object.values(raw.properties).every(isSupportedProperty);
}

function isSupportedProperty(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (raw.type === "object") return isSupportedObject(raw, OBJECT_KEYS);
  if (raw.type === "array") {
    if (!Object.keys(raw).every((k) => ARRAY_KEYS.has(k))) return false;
    const items = raw.items;
    if (!isPlainObject(items)) return false;
    if (items.type === "object") return isSupportedObject(items, OBJECT_KEYS);
    return isSupportedPrimitive(items);
  }
  return isSupportedPrimitive(raw);
}

/** True if `schema` is entirely within the subset the visual builder can represent losslessly. */
export function isVisuallyEditable(schema: unknown): boolean {
  if (!isPlainObject(schema)) return false;
  return isSupportedObject(schema, ROOT_KEYS);
}

function primitiveToField(name: string, raw: Record<string, unknown>, required: boolean): SchemaField {
  return {
    id: nextFieldId(),
    name,
    type: raw.type as PrimitiveType,
    required,
    description: typeof raw.description === "string" ? raw.description : "",
    format: typeof raw.format === "string" ? raw.format : "",
    enumText: Array.isArray(raw.enum) ? raw.enum.join(", ") : "",
    itemType: "string",
    children: [],
  };
}

function objectToField(name: string, raw: Record<string, unknown>, required: boolean): SchemaField {
  return {
    id: nextFieldId(),
    name,
    type: "object",
    required,
    description: typeof raw.description === "string" ? raw.description : "",
    format: "",
    enumText: "",
    itemType: "string",
    children: objectToFields(raw),
  };
}

function objectToFields(schema: Record<string, unknown>): SchemaField[] {
  if (!isPlainObject(schema.properties)) return [];
  const requiredSet = new Set(Array.isArray(schema.required) ? (schema.required as unknown[]) : []);
  return Object.entries(schema.properties).map(([name, raw]) => {
    const propRaw = raw as Record<string, unknown>;
    const required = requiredSet.has(name);
    if (propRaw.type === "object") return objectToField(name, propRaw, required);
    if (propRaw.type === "array") {
      const items = propRaw.items as Record<string, unknown>;
      const isObjectItems = items.type === "object";
      return {
        id: nextFieldId(),
        name,
        type: "array",
        required,
        description: typeof propRaw.description === "string" ? propRaw.description : "",
        format: "",
        enumText: "",
        itemType: isObjectItems ? "object" : (items.type as PrimitiveType),
        children: isObjectItems ? objectToFields(items) : [],
      };
    }
    return primitiveToField(name, propRaw, required);
  });
}

/** Converts a schema known to satisfy {@link isVisuallyEditable} into builder fields. */
export function jsonSchemaToFields(schema: Record<string, unknown>): SchemaField[] {
  return objectToFields(schema);
}
