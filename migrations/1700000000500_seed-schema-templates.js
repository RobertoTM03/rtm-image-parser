/* eslint-disable camelcase */

exports.shorthands = undefined;

const TICKET_SCHEMA = {
  type: "object",
  required: ["merchant", "date", "total"],
  properties: {
    merchant: { type: "string" },
    date: { type: "string", format: "date" },
    total: { type: "number" },
    currency: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unit_price: { type: "number" },
        },
      },
    },
  },
};

const TICKET_HINTS = {
  merchant: "Nombre del comercio o establecimiento tal como aparece en la cabecera del ticket",
  date: "Fecha de la compra en formato ISO 8601 (YYYY-MM-DD)",
  total: "Importe total pagado, incluyendo impuestos",
  currency: "Codigo de moneda ISO 4217 (ej. EUR, USD) si aparece en el ticket",
  items: "Lista de lineas de producto/servicio con su descripcion, cantidad y precio unitario",
};

const FACTURA_SCHEMA = {
  type: "object",
  required: ["invoice_number", "issue_date", "total"],
  properties: {
    invoice_number: { type: "string" },
    issue_date: { type: "string", format: "date" },
    due_date: { type: "string", format: "date" },
    issuer_name: { type: "string" },
    issuer_tax_id: { type: "string" },
    recipient_name: { type: "string" },
    subtotal: { type: "number" },
    tax_amount: { type: "number" },
    total: { type: "number" },
    currency: { type: "string" },
  },
};

const FACTURA_HINTS = {
  invoice_number: "Numero o identificador unico de la factura",
  issue_date: "Fecha de emision en formato ISO 8601 (YYYY-MM-DD)",
  due_date: "Fecha limite de pago en formato ISO 8601 (YYYY-MM-DD), si aparece",
  issuer_name: "Nombre o razon social de quien emite la factura",
  issuer_tax_id: "NIF/CIF/identificador fiscal del emisor",
  recipient_name: "Nombre o razon social del destinatario de la factura",
  subtotal: "Base imponible antes de impuestos",
  tax_amount: "Importe total de impuestos aplicados",
  total: "Importe total de la factura, impuestos incluidos",
  currency: "Codigo de moneda ISO 4217 (ej. EUR, USD) si aparece en la factura",
};

exports.up = async (pgm) => {
  await pgm.db.query(
    `INSERT INTO schema_templates (name, description, schema, field_hints) VALUES
       ($1, $2, $3::jsonb, $4::jsonb),
       ($5, $6, $7::jsonb, $8::jsonb)`,
    [
      "ticket",
      "Ticket de compra / recibo de establecimiento",
      JSON.stringify(TICKET_SCHEMA),
      JSON.stringify(TICKET_HINTS),
      "factura",
      "Factura comercial con datos de emisor, receptor y lineas de detalle",
      JSON.stringify(FACTURA_SCHEMA),
      JSON.stringify(FACTURA_HINTS),
    ],
  );
};

exports.down = async (pgm) => {
  await pgm.db.query(`DELETE FROM schema_templates WHERE name IN ('ticket', 'factura')`);
};
