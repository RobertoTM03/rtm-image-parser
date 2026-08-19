/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("extraction_logs", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    document_type: { type: "text", notNull: true },
    schema_version: { type: "integer", notNull: true },
    models_used: { type: "jsonb", notNull: true },
    models_dropped: { type: "jsonb", notNull: true, default: pgm.func("'[]'::jsonb") },
    confidence: { type: "numeric" },
    crosscheck_passed: { type: "boolean" },
    processing_time_ms: { type: "integer", notNull: true },
    status: { type: "text", notNull: true },
    image_hash: { type: "text", notNull: true },
    result_data: { type: "jsonb" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("extraction_logs", "document_type");
  pgm.createIndex("extraction_logs", ["image_hash", "document_type", "schema_version"]);
};

exports.down = (pgm) => {
  pgm.dropTable("extraction_logs");
};
