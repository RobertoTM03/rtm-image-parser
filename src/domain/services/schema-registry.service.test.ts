import { describe, expect, it } from "vitest";
import { SchemaRegistryService } from "./schema-registry.service";
import type { SchemaRepositoryPort } from "../ports/schema-repository.port";
import type { SchemaTemplate } from "../entities/schema-template.entity";
import type {
  CreateSchemaDefinitionInput,
  SchemaDefinition,
  UpdateSchemaDefinitionInput,
} from "../entities/schema-definition.entity";
import { DocumentTypeAlreadyExistsError, DocumentTypeNotFoundError, TemplateNotFoundError } from "../errors/domain-errors";

class InMemorySchemaRepository implements SchemaRepositoryPort {
  templates: SchemaTemplate[] = [
    {
      id: "t1",
      name: "ticket",
      description: null,
      schema: { type: "object" },
      fieldHints: { total: "importe total" },
      createdAt: new Date(),
    },
  ];
  definitions: SchemaDefinition[] = [];

  async listTemplates() {
    return this.templates;
  }

  async getTemplate(name: string) {
    return this.templates.find((t) => t.name === name) ?? null;
  }

  async createSchema(input: CreateSchemaDefinitionInput): Promise<SchemaDefinition> {
    if (this.definitions.some((d) => d.documentType === input.documentType && d.active)) {
      throw new DocumentTypeAlreadyExistsError(input.documentType);
    }
    const def: SchemaDefinition = {
      id: `id-${this.definitions.length + 1}`,
      documentType: input.documentType,
      version: 1,
      basedOnTemplate: input.basedOnTemplate ?? null,
      schema: input.schema,
      fieldHints: input.fieldHints ?? {},
      active: true,
      createdAt: new Date(),
    };
    this.definitions.push(def);
    return def;
  }

  async listActiveSchemas() {
    return this.definitions.filter((d) => d.active);
  }

  async getActiveSchema(documentType: string) {
    return this.definitions.find((d) => d.documentType === documentType && d.active) ?? null;
  }

  async updateSchema(documentType: string, patch: UpdateSchemaDefinitionInput): Promise<SchemaDefinition> {
    const current = this.definitions.find((d) => d.documentType === documentType && d.active);
    if (!current) throw new DocumentTypeNotFoundError(documentType);
    current.active = false;
    const next: SchemaDefinition = {
      ...current,
      id: `id-${this.definitions.length + 1}`,
      version: current.version + 1,
      schema: patch.schema ?? current.schema,
      fieldHints: patch.fieldHints ?? current.fieldHints,
      active: true,
      createdAt: new Date(),
    };
    this.definitions.push(next);
    return next;
  }

  async listVersions(documentType: string) {
    return this.definitions.filter((d) => d.documentType === documentType).sort((a, b) => b.version - a.version);
  }
}

describe("SchemaRegistryService", () => {
  it("creates a schema from scratch", async () => {
    const service = new SchemaRegistryService(new InMemorySchemaRepository());
    const def = await service.createSchema({ documentType: "custom", schema: { type: "object" } });
    expect(def.version).toBe(1);
    expect(def.documentType).toBe("custom");
  });

  it("creates a schema from a template, inheriting schema and hints", async () => {
    const service = new SchemaRegistryService(new InMemorySchemaRepository());
    const def = await service.createSchema({ documentType: "my-ticket", basedOnTemplate: "ticket" });
    expect(def.schema).toEqual({ type: "object" });
    expect(def.fieldHints).toEqual({ total: "importe total" });
    expect(def.basedOnTemplate).toBe("ticket");
  });

  it("throws TemplateNotFoundError for an unknown template", async () => {
    const service = new SchemaRegistryService(new InMemorySchemaRepository());
    await expect(service.createSchema({ documentType: "x", basedOnTemplate: "unknown" })).rejects.toBeInstanceOf(
      TemplateNotFoundError,
    );
  });

  it("throws when neither schema nor basedOnTemplate is provided", async () => {
    const service = new SchemaRegistryService(new InMemorySchemaRepository());
    await expect(service.createSchema({ documentType: "x" })).rejects.toThrow();
  });

  it("getActiveSchema throws DocumentTypeNotFoundError when none exists", async () => {
    const service = new SchemaRegistryService(new InMemorySchemaRepository());
    await expect(service.getActiveSchema("nope")).rejects.toBeInstanceOf(DocumentTypeNotFoundError);
  });

  it("updateSchema bumps version and preserves history", async () => {
    const service = new SchemaRegistryService(new InMemorySchemaRepository());
    await service.createSchema({ documentType: "custom", schema: { type: "object" } });
    const updated = await service.updateSchema("custom", { schema: { type: "object", properties: {} } });
    expect(updated.version).toBe(2);

    const versions = await service.listVersions("custom");
    expect(versions).toHaveLength(2);
    expect(versions[0]!.version).toBe(2);
    expect(versions[1]!.active).toBe(false);
  });
});
