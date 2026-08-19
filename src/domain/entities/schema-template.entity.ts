export interface SchemaTemplate {
  id: string;
  name: string;
  description: string | null;
  schema: object;
  fieldHints: Record<string, string>;
  createdAt: Date;
}
