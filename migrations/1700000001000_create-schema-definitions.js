/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("schema_definitions", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    document_type: { type: "text", notNull: true },
    version: { type: "integer", notNull: true },
    based_on_template: { type: "text", references: "schema_templates(name)", onDelete: "SET NULL" },
    schema: { type: "jsonb", notNull: true },
    field_hints: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    active: { type: "boolean", notNull: true, default: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("schema_definitions", "schema_definitions_document_type_version_uq", {
    unique: ["document_type", "version"],
  });

  // Exactly one active row per document_type.
  pgm.createIndex("schema_definitions", "document_type", {
    name: "schema_definitions_active_uq",
    unique: true,
    where: "active",
  });

  pgm.createIndex("schema_definitions", "document_type", {
    name: "schema_definitions_document_type_idx",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("schema_definitions");
};
