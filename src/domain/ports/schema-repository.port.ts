import type { SchemaTemplate } from "../entities/schema-template.entity";
import type {
  CreateSchemaDefinitionInput,
  SchemaDefinition,
  UpdateSchemaDefinitionInput,
} from "../entities/schema-definition.entity";

export interface SchemaRepositoryPort {
  listTemplates(): Promise<SchemaTemplate[]>;
  getTemplate(name: string): Promise<SchemaTemplate | null>;

  createSchema(input: CreateSchemaDefinitionInput): Promise<SchemaDefinition>;
  listActiveSchemas(): Promise<SchemaDefinition[]>;
  getActiveSchema(documentType: string): Promise<SchemaDefinition | null>;
  /** Inserts a new version row and deactivates the previous active row. Never overwrites history. */
  updateSchema(documentType: string, patch: UpdateSchemaDefinitionInput): Promise<SchemaDefinition>;
  listVersions(documentType: string): Promise<SchemaDefinition[]>;
}
