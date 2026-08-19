import type { Kysely } from "kysely";
import type { SchemaRepositoryPort } from "../../../domain/ports/schema-repository.port";
import type { SchemaTemplate } from "../../../domain/entities/schema-template.entity";
import type {
  CreateSchemaDefinitionInput,
  SchemaDefinition,
  UpdateSchemaDefinitionInput,
} from "../../../domain/entities/schema-definition.entity";
import { DocumentTypeAlreadyExistsError, DocumentTypeNotFoundError } from "../../../domain/errors/domain-errors";
import type { Database } from "./kysely.types";

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  schema: object;
  field_hints: Record<string, string>;
  created_at: Date;
}

interface DefinitionRow {
  id: string;
  document_type: string;
  version: number;
  based_on_template: string | null;
  schema: object;
  field_hints: Record<string, string>;
  active: boolean;
  created_at: Date;
}

function toTemplateEntity(row: TemplateRow): SchemaTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    schema: row.schema,
    fieldHints: row.field_hints,
    createdAt: row.created_at,
  };
}

function toDefinitionEntity(row: DefinitionRow): SchemaDefinition {
  return {
    id: row.id,
    documentType: row.document_type,
    version: row.version,
    basedOnTemplate: row.based_on_template,
    schema: row.schema,
    fieldHints: row.field_hints,
    active: row.active,
    createdAt: row.created_at,
  };
}

export class PostgresSchemaRepository implements SchemaRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async listTemplates(): Promise<SchemaTemplate[]> {
    const rows = await this.db.selectFrom("schema_templates").selectAll().orderBy("name").execute();
    return rows.map((row) => toTemplateEntity(row as TemplateRow));
  }

  async getTemplate(name: string): Promise<SchemaTemplate | null> {
    const row = await this.db.selectFrom("schema_templates").selectAll().where("name", "=", name).executeTakeFirst();
    return row ? toTemplateEntity(row as TemplateRow) : null;
  }

  async createSchema(input: CreateSchemaDefinitionInput): Promise<SchemaDefinition> {
    const existing = await this.getActiveSchema(input.documentType);
    if (existing) {
      throw new DocumentTypeAlreadyExistsError(input.documentType);
    }

    const row = await this.db
      .insertInto("schema_definitions")
      .values({
        document_type: input.documentType,
        version: 1,
        based_on_template: input.basedOnTemplate ?? null,
        schema: JSON.stringify(input.schema),
        field_hints: JSON.stringify(input.fieldHints ?? {}),
        active: true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return toDefinitionEntity(row as DefinitionRow);
  }

  async listActiveSchemas(): Promise<SchemaDefinition[]> {
    const rows = await this.db
      .selectFrom("schema_definitions")
      .selectAll()
      .where("active", "=", true)
      .orderBy("document_type")
      .execute();

    return rows.map((row) => toDefinitionEntity(row as DefinitionRow));
  }

  async getActiveSchema(documentType: string): Promise<SchemaDefinition | null> {
    const row = await this.db
      .selectFrom("schema_definitions")
      .selectAll()
      .where("document_type", "=", documentType)
      .where("active", "=", true)
      .executeTakeFirst();

    return row ? toDefinitionEntity(row as DefinitionRow) : null;
  }

  async updateSchema(documentType: string, patch: UpdateSchemaDefinitionInput): Promise<SchemaDefinition> {
    return this.db.transaction().execute(async (trx) => {
      const current = (await trx
        .selectFrom("schema_definitions")
        .selectAll()
        .where("document_type", "=", documentType)
        .where("active", "=", true)
        .executeTakeFirst()) as DefinitionRow | undefined;

      if (!current) {
        throw new DocumentTypeNotFoundError(documentType);
      }

      await trx.updateTable("schema_definitions").set({ active: false }).where("id", "=", current.id).execute();

      const nextSchema = patch.schema ?? current.schema;
      const nextFieldHints = patch.fieldHints ?? current.field_hints;

      const inserted = await trx
        .insertInto("schema_definitions")
        .values({
          document_type: documentType,
          version: current.version + 1,
          based_on_template: current.based_on_template,
          schema: JSON.stringify(nextSchema),
          field_hints: JSON.stringify(nextFieldHints),
          active: true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return toDefinitionEntity(inserted as DefinitionRow);
    });
  }

  async listVersions(documentType: string): Promise<SchemaDefinition[]> {
    const rows = await this.db
      .selectFrom("schema_definitions")
      .selectAll()
      .where("document_type", "=", documentType)
      .orderBy("version", "desc")
      .execute();

    return rows.map((row) => toDefinitionEntity(row as DefinitionRow));
  }
}
