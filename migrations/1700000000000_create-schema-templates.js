/* eslint-disable camelcase */
// Seed data lives in the following migration (1700000000500_seed-schema-templates)
// since pgm.db.query() executes eagerly while pgm.createTable() is queued and
// only runs after this function returns — they can't safely share one migration.

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension("pgcrypto", { ifNotExists: true });

  pgm.createTable("schema_templates", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    name: { type: "text", notNull: true, unique: true },
    description: { type: "text" },
    schema: { type: "jsonb", notNull: true },
    field_hints: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
};

exports.down = (pgm) => {
  pgm.dropTable("schema_templates");
};
