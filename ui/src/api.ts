const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface SchemaTemplateDto {
  name: string;
  description: string | null;
  schema: Record<string, unknown>;
  fieldHints: Record<string, string>;
}

export interface SchemaDefinitionDto {
  documentType: string;
  version: number;
  basedOnTemplate: string | null;
  schema: Record<string, unknown>;
  fieldHints: Record<string, string>;
  active: boolean;
  createdAt: string;
}

export interface ExtractionMetadataDto {
  modelsUsed: string[];
  modelsDropped: Array<{ modelId: string; reason: string }>;
  confidence: number;
  processingTimeMs: number;
  schemaVersion: number;
}

export interface FieldMismatchDto {
  field: string;
  kind: "value_mismatch" | "missing_field";
  values: Record<string, unknown>;
}

export type ExtractResult =
  | { kind: "ok"; data: Record<string, unknown>; metadata: ExtractionMetadataDto }
  | { kind: "discordant"; score: number; mismatches: FieldMismatchDto[]; metadata: ExtractionMetadataDto }
  | { kind: "error"; status: number; message: string };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(extractMessage(body, status));
    this.name = "ApiError";
  }
}

function extractMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string") {
    return (body as { message: string }).message;
  }
  return `Request failed with status ${status}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : undefined;

  if (!response.ok) {
    throw new ApiError(response.status, body);
  }

  return body as T;
}

export function listTemplates(): Promise<SchemaTemplateDto[]> {
  return requestJson<{ templates: SchemaTemplateDto[] }>("/v1/templates").then((r) => r.templates);
}

export function listSchemas(): Promise<SchemaDefinitionDto[]> {
  return requestJson<{ schemas: SchemaDefinitionDto[] }>("/v1/schemas").then((r) => r.schemas);
}

export function getSchema(documentType: string): Promise<SchemaDefinitionDto> {
  return requestJson<SchemaDefinitionDto>(`/v1/schemas/${encodeURIComponent(documentType)}`);
}

export function listSchemaVersions(documentType: string): Promise<SchemaDefinitionDto[]> {
  return requestJson<{ versions: SchemaDefinitionDto[] }>(`/v1/schemas/${encodeURIComponent(documentType)}/versions`).then(
    (r) => r.versions,
  );
}

export interface CreateSchemaInput {
  documentType: string;
  basedOnTemplate?: string;
  schema?: Record<string, unknown>;
  fieldHints?: Record<string, string>;
}

export function createSchema(input: CreateSchemaInput): Promise<SchemaDefinitionDto> {
  return requestJson<SchemaDefinitionDto>("/v1/schemas", { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateSchemaInput {
  schema?: Record<string, unknown>;
  fieldHints?: Record<string, string>;
}

export function updateSchema(documentType: string, patch: UpdateSchemaInput): Promise<SchemaDefinitionDto> {
  return requestJson<SchemaDefinitionDto>(`/v1/schemas/${encodeURIComponent(documentType)}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export interface ExtractionLogDto {
  id: string;
  documentType: string;
  schemaVersion: number;
  modelsUsed: string[];
  modelsDropped: Array<{ modelId: string; reason: string }>;
  confidence: number | null;
  crosscheckPassed: boolean | null;
  processingTimeMs: number;
  status: "ok" | "discordant" | "failed";
  createdAt: string;
}

export interface ExtractionLogPageDto {
  logs: ExtractionLogDto[];
  hasMore: boolean;
}

export function listExtractionLogs(limit = 10, offset = 0): Promise<ExtractionLogPageDto> {
  return requestJson<ExtractionLogPageDto>(`/v1/extraction-logs?limit=${limit}&offset=${offset}`);
}

export async function extractDocument(file: File, documentType: string): Promise<ExtractResult> {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("document_type", documentType);

  const response = await fetch(`${API_BASE_URL}/v1/extract`, { method: "POST", body: formData });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : undefined;

  if (response.status === 200) {
    return { kind: "ok", data: body.data, metadata: body.metadata };
  }
  if (response.status === 422) {
    return { kind: "discordant", score: body.score, mismatches: body.mismatches, metadata: body.metadata };
  }
  return { kind: "error", status: response.status, message: extractMessage(body, response.status) };
}
