import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiError,
  createSchema,
  getSchema,
  listSchemas,
  listSchemaVersions,
  listTemplates,
  updateSchema,
} from "../api";
import type { SchemaDefinitionDto, SchemaTemplateDto } from "../api";
import SchemaEditor from "../components/SchemaEditor";
import { validateSchemaText } from "../lib/schemaValidation";

interface HintRow {
  key: string;
  value: string;
}

function hintsToRows(hints: Record<string, string>): HintRow[] {
  return Object.entries(hints).map(([key, value]) => ({ key, value }));
}

function rowsToHints(rows: HintRow[]): Record<string, string> {
  const hints: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.trim()) hints[row.key.trim()] = row.value;
  }
  return hints;
}

function FieldHintsEditor({ rows, onChange }: { rows: HintRow[]; onChange: (rows: HintRow[]) => void }) {
  function update(index: number, patch: Partial<HintRow>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function remove(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="field-hints-editor">
      {rows.map((row, i) => (
        <div className="row" key={i}>
          <input type="text" placeholder="field" value={row.key} onChange={(e) => update(i, { key: e.target.value })} />
          <input
            type="text"
            placeholder="hint for the LLM"
            value={row.value}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <button type="button" className="secondary" onClick={() => remove(i)}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="secondary" onClick={() => onChange([...rows, { key: "", value: "" }])}>
        + Add hint
      </button>
    </div>
  );
}

export default function SchemasPage() {
  const [templates, setTemplates] = useState<SchemaTemplateDto[]>([]);
  const [schemas, setSchemas] = useState<SchemaDefinitionDto[]>([]);
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  function refreshLists() {
    listTemplates()
      .then(setTemplates)
      .catch((err) => setListError(err instanceof Error ? err.message : String(err)));
    listSchemas()
      .then(setSchemas)
      .catch((err) => setListError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(refreshLists, []);

  return (
    <div className="layout-two-col">
      <div className="card">
        <h3>Templates</h3>
        <div className="list">
          {templates.map((t) => (
            <div key={t.name} className="list-item" style={{ padding: "8px 12px" }}>
              <div className="doc-type">{t.name}</div>
              <div className="meta">{t.description}</div>
            </div>
          ))}
        </div>

        <h3 style={{ marginTop: 20 }}>Schemas</h3>
        {listError && <div className="banner error">{listError}</div>}
        <div className="list">
          {schemas.map((s) => (
            <button
              key={s.documentType}
              className={`list-item ${selected === s.documentType ? "selected" : ""}`}
              onClick={() => setSelected(s.documentType)}
            >
              <div className="doc-type">{s.documentType}</div>
              <div className="meta">
                v{s.version}
                {s.basedOnTemplate ? ` · from ${s.basedOnTemplate}` : ""}
              </div>
            </button>
          ))}
          {schemas.length === 0 && <div className="empty-state">No schemas yet.</div>}
        </div>

        <button className="primary" onClick={() => setSelected("new")}>
          + New schema
        </button>
      </div>

      {selected === "new" && (
        <NewSchemaForm
          templates={templates}
          onCreated={(created) => {
            refreshLists();
            setSelected(created.documentType);
          }}
        />
      )}
      {selected && selected !== "new" && (
        <SchemaDetail key={selected} documentType={selected} onUpdated={refreshLists} />
      )}
      {!selected && (
        <div className="card">
          <div className="empty-state">Select a schema on the left, or create a new one.</div>
        </div>
      )}
    </div>
  );
}

function NewSchemaForm({
  templates,
  onCreated,
}: {
  templates: SchemaTemplateDto[];
  onCreated: (schema: SchemaDefinitionDto) => void;
}) {
  const [documentType, setDocumentType] = useState("");
  const [basedOnTemplate, setBasedOnTemplate] = useState("");
  const [schemaText, setSchemaText] = useState("");
  const [hintRows, setHintRows] = useState<HintRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const validation = useMemo(() => validateSchemaText(schemaText), [schemaText]);

  function applyTemplate(name: string) {
    setBasedOnTemplate(name);
    const template = templates.find((t) => t.name === name);
    if (template) {
      setSchemaText(JSON.stringify(template.schema, null, 2));
      setHintRows(hintsToRows(template.fieldHints));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!validation.valid) {
      setError(`Fix the schema before creating: ${validation.errors[0]}`);
      return;
    }
    const parsedSchema = validation.parsed;

    if (!documentType.trim()) {
      setError("document_type is required");
      return;
    }
    if (!basedOnTemplate && !parsedSchema) {
      setError("Provide a JSON Schema or pick a template to base it on");
      return;
    }

    setSaving(true);
    try {
      const created = await createSchema({
        documentType: documentType.trim(),
        basedOnTemplate: basedOnTemplate || undefined,
        schema: parsedSchema,
        fieldHints: rowsToHints(hintRows),
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h2>New schema</h2>
      {error && <div className="banner error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <label htmlFor="new-document-type">document_type</label>
        <input
          id="new-document-type"
          type="text"
          placeholder="e.g. delivery-note"
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value)}
        />

        <label htmlFor="new-based-on">Based on template (optional)</label>
        <select id="new-based-on" value={basedOnTemplate} onChange={(e) => applyTemplate(e.target.value)}>
          <option value="">— none, define schema from scratch —</option>
          {templates.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>

        <label htmlFor="new-schema">JSON Schema</label>
        <SchemaEditor key={basedOnTemplate} id="new-schema" value={schemaText} onChange={setSchemaText} />

        <label>Field hints</label>
        <FieldHintsEditor rows={hintRows} onChange={setHintRows} />

        <button className="primary" type="submit" disabled={saving || !validation.valid}>
          {saving ? "Creating…" : "Create schema"}
        </button>
      </form>
    </div>
  );
}

function SchemaDetail({ documentType, onUpdated }: { documentType: string; onUpdated: () => void }) {
  const [current, setCurrent] = useState<SchemaDefinitionDto | null>(null);
  const [versions, setVersions] = useState<SchemaDefinitionDto[]>([]);
  const [schemaText, setSchemaText] = useState("");
  const [hintRows, setHintRows] = useState<HintRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setError(null);
    getSchema(documentType)
      .then((schema) => {
        setCurrent(schema);
        setSchemaText(JSON.stringify(schema.schema, null, 2));
        setHintRows(hintsToRows(schema.fieldHints));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    listSchemaVersions(documentType)
      .then(setVersions)
      .catch(() => {
        /* version history is supplementary; ignore failures */
      });
  }, [documentType]);

  const validation = useMemo(() => validateSchemaText(schemaText), [schemaText]);

  async function handleSave() {
    setError(null);
    if (!validation.valid || !validation.parsed) {
      setError(`Fix the schema before saving: ${validation.errors[0] ?? "schema is empty"}`);
      return;
    }

    setSaving(true);
    try {
      const updated = await updateSchema(documentType, { schema: validation.parsed, fieldHints: rowsToHints(hintRows) });
      setCurrent(updated);
      const newVersions = await listSchemaVersions(documentType);
      setVersions(newVersions);
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!current) {
    return <div className="card">{error ? <div className="banner error">{error}</div> : "Loading…"}</div>;
  }

  return (
    <div className="card">
      <h2>
        {documentType} <span className="pill ok">v{current.version}</span>
      </h2>
      {error && <div className="banner error">{error}</div>}

      <label htmlFor="edit-schema">JSON Schema</label>
      <SchemaEditor id="edit-schema" value={schemaText} onChange={setSchemaText} />

      <label>Field hints</label>
      <FieldHintsEditor rows={hintRows} onChange={setHintRows} />

      <div className="actions-row">
        <button className="primary" onClick={handleSave} disabled={saving || !validation.valid || !schemaText.trim()}>
          {saving ? "Saving…" : "Save as new version"}
        </button>
      </div>

      {versions.length > 1 && (
        <>
          <h3 style={{ marginTop: 20 }}>Version history</h3>
          <table className="mismatch-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Active</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.version}>
                  <td>v{v.version}</td>
                  <td>{v.active ? <span className="pill ok">active</span> : <span className="pill warn">superseded</span>}</td>
                  <td>{new Date(v.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
