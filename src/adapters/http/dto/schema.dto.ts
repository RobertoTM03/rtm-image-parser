import { z } from "zod";
import type { SchemaDefinition } from "../../../domain/entities/schema-definition.entity";

export const createSchemaBodySchema = z
  .object({
    documentType: z.string().min(1),
    basedOnTemplate: z.string().min(1).optional(),
    schema: z.record(z.string(), z.unknown()).optional(),
    fieldHints: z.record(z.string(), z.string()).optional(),
  })
  .refine((body) => Boolean(body.basedOnTemplate) || Boolean(body.schema), {
    message: "Either basedOnTemplate or schema must be provided",
  });

export type CreateSchemaBody = z.infer<typeof createSchemaBodySchema>;

export const updateSchemaBodySchema = z
  .object({
    schema: z.record(z.string(), z.unknown()).optional(),
    fieldHints: z.record(z.string(), z.string()).optional(),
  })
  .refine((body) => Boolean(body.schema) || Boolean(body.fieldHints), {
    message: "At least one of schema or fieldHints must be provided",
  });

export type UpdateSchemaBody = z.infer<typeof updateSchemaBodySchema>;

export interface SchemaDefinitionDto {
  documentType: string;
  version: number;
  basedOnTemplate: string | null;
  schema: object;
  fieldHints: Record<string, string>;
  active: boolean;
  createdAt: string;
}

export function toSchemaDefinitionDto(def: SchemaDefinition): SchemaDefinitionDto {
  return {
    documentType: def.documentType,
    version: def.version,
    basedOnTemplate: def.basedOnTemplate,
    schema: def.schema,
    fieldHints: def.fieldHints,
    active: def.active,
    createdAt: def.createdAt.toISOString(),
  };
}
