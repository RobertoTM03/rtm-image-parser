export interface SchemaDefinition {
  id: string;
  documentType: string;
  version: number;
  basedOnTemplate: string | null;
  schema: object;
  fieldHints: Record<string, string>;
  active: boolean;
  createdAt: Date;
}

export interface CreateSchemaDefinitionInput {
  documentType: string;
  basedOnTemplate?: string | null;
  schema: object;
  fieldHints?: Record<string, string>;
}

export interface UpdateSchemaDefinitionInput {
  schema?: object;
  fieldHints?: Record<string, string>;
}
