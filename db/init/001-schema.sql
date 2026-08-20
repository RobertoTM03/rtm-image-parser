-- Full database schema for rtm-image-parser.
--
-- This runs automatically the first time the `db` container initializes an
-- empty data directory (see docker-entrypoint-initdb.d in the postgres
-- image). There is no migration tool in this project: this file is the only
-- source of truth for the schema, and it is safe to edit directly since the
-- project isn't deployed anywhere with existing data to preserve. To pick up
-- changes made here on an existing local volume, recreate it:
--   docker compose down -v && docker compose up -d --build

create extension if not exists pgcrypto;

create table schema_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  schema jsonb not null,
  field_hints jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table schema_definitions (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  version integer not null,
  based_on_template text references schema_templates (name) on delete set null,
  schema jsonb not null,
  field_hints jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint schema_definitions_document_type_version_uq unique (document_type, version)
);

-- Exactly one active row per document_type.
create unique index schema_definitions_active_uq on schema_definitions (document_type) where active;
create index schema_definitions_document_type_idx on schema_definitions (document_type);

create table extraction_logs (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  schema_version integer not null,
  models_used jsonb not null,
  models_dropped jsonb not null default '[]'::jsonb,
  confidence numeric,
  crosscheck_passed boolean,
  processing_time_ms integer not null,
  status text not null,
  image_hash text not null,
  result_data jsonb,
  created_at timestamptz not null default now()
);

create index extraction_logs_document_type_idx on extraction_logs (document_type);
create index extraction_logs_image_hash_document_type_schema_version_idx
  on extraction_logs (image_hash, document_type, schema_version);

insert into schema_templates (name, description, schema, field_hints) values
  (
    'ticket',
    'Ticket de compra / recibo de establecimiento',
    '{
      "type": "object",
      "required": ["merchant", "date", "total"],
      "properties": {
        "merchant": { "type": "string" },
        "date": { "type": "string", "format": "date" },
        "total": { "type": "number" },
        "currency": { "type": "string" },
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "description": { "type": "string" },
              "quantity": { "type": "number" },
              "unit_price": { "type": "number" }
            }
          }
        }
      }
    }'::jsonb,
    '{
      "merchant": "Nombre del comercio o establecimiento tal como aparece en la cabecera del ticket",
      "date": "Fecha de la compra en formato ISO 8601 (YYYY-MM-DD)",
      "total": "Importe total pagado, incluyendo impuestos",
      "currency": "Codigo de moneda ISO 4217 (ej. EUR, USD) si aparece en el ticket",
      "items": "Lista de lineas de producto/servicio con su descripcion, cantidad y precio unitario"
    }'::jsonb
  ),
  (
    'factura',
    'Factura comercial con datos de emisor, receptor y lineas de detalle',
    '{
      "type": "object",
      "required": ["invoice_number", "issue_date", "total"],
      "properties": {
        "invoice_number": { "type": "string" },
        "issue_date": { "type": "string", "format": "date" },
        "due_date": { "type": "string", "format": "date" },
        "issuer_name": { "type": "string" },
        "issuer_tax_id": { "type": "string" },
        "recipient_name": { "type": "string" },
        "subtotal": { "type": "number" },
        "tax_amount": { "type": "number" },
        "total": { "type": "number" },
        "currency": { "type": "string" }
      }
    }'::jsonb,
    '{
      "invoice_number": "Numero o identificador unico de la factura",
      "issue_date": "Fecha de emision en formato ISO 8601 (YYYY-MM-DD)",
      "due_date": "Fecha limite de pago en formato ISO 8601 (YYYY-MM-DD), si aparece",
      "issuer_name": "Nombre o razon social de quien emite la factura",
      "issuer_tax_id": "NIF/CIF/identificador fiscal del emisor",
      "recipient_name": "Nombre o razon social del destinatario de la factura",
      "subtotal": "Base imponible antes de impuestos",
      "tax_amount": "Importe total de impuestos aplicados",
      "total": "Importe total de la factura, impuestos incluidos",
      "currency": "Codigo de moneda ISO 4217 (ej. EUR, USD) si aparece en la factura"
    }'::jsonb
  );
