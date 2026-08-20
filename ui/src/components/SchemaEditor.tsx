import { useMemo, useState } from "react";
import type { SchemaField, FieldType, PrimitiveType } from "../lib/schemaFields";
import { emptyField, fieldsToJsonSchema, isVisuallyEditable, jsonSchemaToFields } from "../lib/schemaFields";
import { validateSchemaText } from "../lib/schemaValidation";

type Mode = "visual" | "json";

const TYPE_LABELS: Record<FieldType, string> = {
  string: "Text",
  number: "Number",
  integer: "Whole number",
  boolean: "Yes / No",
  array: "List",
  object: "Group of fields",
};

const ITEM_TYPE_LABELS: Record<PrimitiveType | "object", string> = {
  string: "of text",
  number: "of numbers",
  integer: "of whole numbers",
  boolean: "of yes/no",
  object: "of groups of fields",
};

const FORMAT_OPTIONS = [
  { value: "", label: "No format" },
  { value: "date", label: "Date" },
  { value: "date-time", label: "Date & time" },
  { value: "email", label: "Email" },
  { value: "uri", label: "URL" },
  { value: "uuid", label: "UUID" },
];

function tryParse(text: string): Record<string, unknown> | undefined {
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export default function SchemaEditor({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (text: string) => void;
}) {
  const parsed = useMemo(() => tryParse(value), [value]);
  const canUseVisual = parsed !== undefined && isVisuallyEditable(Object.keys(parsed).length ? parsed : { type: "object" });
  const [mode, setMode] = useState<Mode>(() => (canUseVisual ? "visual" : "json"));
  const [fields, setFields] = useState<SchemaField[]>(() =>
    parsed && Object.keys(parsed).length ? jsonSchemaToFields(parsed) : [],
  );

  const validation = useMemo(() => validateSchemaText(value), [value]);

  function switchToVisual() {
    if (!canUseVisual) return;
    setFields(parsed && Object.keys(parsed).length ? jsonSchemaToFields(parsed) : []);
    setMode("visual");
  }

  function updateFields(next: SchemaField[]) {
    setFields(next);
    onChange(JSON.stringify(fieldsToJsonSchema(next), null, 2));
  }

  return (
    <div className="schema-editor">
      <div className="editor-mode-toggle">
        <button type="button" className={mode === "visual" ? "active" : ""} onClick={switchToVisual} disabled={!canUseVisual}>
          Visual builder
        </button>
        <button type="button" className={mode === "json" ? "active" : ""} onClick={() => setMode("json")}>
          {"</>"} JSON
        </button>
        {!canUseVisual && (
          <span className="mode-toggle-hint">
            {parsed === undefined ? "Fix the JSON below to enable the visual builder" : "Uses advanced JSON Schema features not supported by the visual builder"}
          </span>
        )}
      </div>

      {mode === "json" && (
        <textarea
          id={id}
          className="code"
          placeholder='{"type":"object","properties":{...}}'
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {mode === "visual" && <FieldListEditor fields={fields} onChange={updateFields} />}

      {value.trim() !== "" && (
        <div className="schema-validation">
          {validation.valid ? (
            <>
              {validation.warnings.length === 0 && <div className="banner ok">✓ Valid JSON Schema</div>}
              {validation.warnings.map((w, i) => (
                <div className="banner warn" key={i}>
                  {w}
                </div>
              ))}
            </>
          ) : (
            <div className="banner error">
              {validation.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FieldListEditor({
  fields,
  onChange,
  depth = 0,
}: {
  fields: SchemaField[];
  onChange: (fields: SchemaField[]) => void;
  depth?: number;
}) {
  function update(index: number, patch: Partial<SchemaField>) {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }
  function remove(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }

  return (
    <div className="visual-field-list" style={depth > 0 ? { marginLeft: 18 } : undefined}>
      {fields.map((field, i) => (
        <FieldRow key={field.id} field={field} onChange={(patch) => update(i, patch)} onRemove={() => remove(i)} depth={depth} />
      ))}
      {fields.length === 0 && <div className="empty-state">No fields yet.</div>}
      <button type="button" className="secondary" onClick={() => onChange([...fields, emptyField()])}>
        + Add field
      </button>
    </div>
  );
}

function FieldRow({
  field,
  onChange,
  onRemove,
  depth,
}: {
  field: SchemaField;
  onChange: (patch: Partial<SchemaField>) => void;
  onRemove: () => void;
  depth: number;
}) {
  return (
    <div className="visual-field-row">
      <div className="visual-field-main">
        <input
          type="text"
          placeholder="field name"
          value={field.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <select value={field.type} onChange={(e) => onChange({ type: e.target.value as FieldType })}>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {field.type === "string" && (
          <select value={field.format} onChange={(e) => onChange({ format: e.target.value })}>
            {FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
        {field.type === "array" && (
          <select value={field.itemType} onChange={(e) => onChange({ itemType: e.target.value as PrimitiveType | "object" })}>
            {Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
        <label className="checkbox-inline">
          <input type="checkbox" checked={field.required} onChange={(e) => onChange({ required: e.target.checked })} />
          required
        </label>
        <button type="button" className="secondary" onClick={onRemove} title="Remove field">
          ✕
        </button>
      </div>

      <input
        type="text"
        placeholder="Description / hint for the LLM (optional)"
        value={field.description}
        onChange={(e) => onChange({ description: e.target.value })}
      />

      {(field.type === "string" || field.type === "number" || field.type === "integer") && (
        <input
          type="text"
          placeholder="Allowed values, comma-separated (optional)"
          value={field.enumText}
          onChange={(e) => onChange({ enumText: e.target.value })}
        />
      )}

      {field.type === "object" && (
        <FieldListEditor fields={field.children} onChange={(children) => onChange({ children })} depth={depth + 1} />
      )}

      {field.type === "array" && field.itemType === "object" && (
        <div style={{ marginLeft: 18 }}>
          <label>List item fields</label>
          <FieldListEditor fields={field.children} onChange={(children) => onChange({ children })} depth={depth + 1} />
        </div>
      )}
    </div>
  );
}
