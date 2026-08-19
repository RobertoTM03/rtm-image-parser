export class DocumentTypeNotFoundError extends Error {
  constructor(documentType: string) {
    super(`No active schema found for document_type "${documentType}"`);
    this.name = "DocumentTypeNotFoundError";
  }
}

export class DocumentTypeAlreadyExistsError extends Error {
  constructor(documentType: string) {
    super(`A schema already exists for document_type "${documentType}"`);
    this.name = "DocumentTypeAlreadyExistsError";
  }
}

export class TemplateNotFoundError extends Error {
  constructor(name: string) {
    super(`No schema template found named "${name}"`);
    this.name = "TemplateNotFoundError";
  }
}

export class AllModelsFailedError extends Error {
  constructor(public readonly reasons: Array<{ modelId: string; reason: string }>) {
    super(`All configured models failed to produce a schema-valid extraction`);
    this.name = "AllModelsFailedError";
  }
}
