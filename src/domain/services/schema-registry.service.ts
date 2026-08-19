import type { SchemaRepositoryPort } from "../ports/schema-repository.port";
import type { SchemaTemplate } from "../entities/schema-template.entity";
import type { SchemaDefinition, UpdateSchemaDefinitionInput } from "../entities/schema-definition.entity";
import { DocumentTypeNotFoundError, TemplateNotFoundError } from "../errors/domain-errors";

export interface CreateSchemaRequest {
  documentType: string;
  basedOnTemplate?: string;
  schema?: object;
  fieldHints?: Record<string, string>;
}

/**
 * Business rules around schema templates/definitions. Delegates all
 * persistence (including version history bookkeeping) to SchemaRepositoryPort.
 */
export class SchemaRegistryService {
  constructor(private readonly repo: SchemaRepositoryPort) {}

  listTemplates(): Promise<SchemaTemplate[]> {
    return this.repo.listTemplates();
  }

  async createSchema(input: CreateSchemaRequest): Promise<SchemaDefinition> {
    let schema = input.schema;
    let fieldHints = input.fieldHints;

    if (input.basedOnTemplate) {
      const template = await this.repo.getTemplate(input.basedOnTemplate);
      if (!template) {
        throw new TemplateNotFoundError(input.basedOnTemplate);
      }
      schema = schema ?? template.schema;
      fieldHints = fieldHints ?? template.fieldHints;
    }

    if (!schema) {
      throw new Error("schema is required when basedOnTemplate is not provided");
    }

    return this.repo.createSchema({
      documentType: input.documentType,
      basedOnTemplate: input.basedOnTemplate ?? null,
      schema,
      fieldHints: fieldHints ?? {},
    });
  }

  listActiveSchemas(): Promise<SchemaDefinition[]> {
    return this.repo.listActiveSchemas();
  }

  async getActiveSchema(documentType: string): Promise<SchemaDefinition> {
    const schema = await this.repo.getActiveSchema(documentType);
    if (!schema) {
      throw new DocumentTypeNotFoundError(documentType);
    }
    return schema;
  }

  updateSchema(documentType: string, patch: UpdateSchemaDefinitionInput): Promise<SchemaDefinition> {
    return this.repo.updateSchema(documentType, patch);
  }

  async listVersions(documentType: string): Promise<SchemaDefinition[]> {
    const versions = await this.repo.listVersions(documentType);
    if (versions.length === 0) {
      throw new DocumentTypeNotFoundError(documentType);
    }
    return versions;
  }
}
