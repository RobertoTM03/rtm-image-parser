import type { SchemaTemplate } from "../../../domain/entities/schema-template.entity";

export interface SchemaTemplateDto {
  name: string;
  description: string | null;
  schema: object;
  fieldHints: Record<string, string>;
}

export function toTemplateDto(template: SchemaTemplate): SchemaTemplateDto {
  return {
    name: template.name,
    description: template.description,
    schema: template.schema,
    fieldHints: template.fieldHints,
  };
}
