import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { extractDocument, listSchemas } from "../api";
import type { ExtractionMetadataDto, ExtractResult, SchemaDefinitionDto } from "../api";

export default function ExtractPage() {
  const [schemas, setSchemas] = useState<SchemaDefinitionDto[]>([]);
  const [documentType, setDocumentType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResult | null>(null);

  useEffect(() => {
    listSchemas()
      .then((list) => {
        setSchemas(list);
        if (list.length > 0) setDocumentType((current) => current || list[0]!.documentType);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, []);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return selected ? URL.createObjectURL(selected) : null;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file || !documentType) return;

    setLoading(true);
    setResult(null);
    try {
      const outcome = await extractDocument(file, documentType);
      setResult(outcome);
    } catch (err) {
      setResult({ kind: "error", status: 0, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="layout-two-col">
      <div className="card">
        <h2>Extract</h2>
        {loadError && <div className="banner error">Could not load schemas: {loadError}</div>}

        <form onSubmit={handleSubmit}>
          <label htmlFor="document-type">Document type</label>
          <select
            id="document-type"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            disabled={schemas.length === 0}
          >
            {schemas.length === 0 ? (
              <option value="">No schemas yet — create one in the Schemas tab</option>
            ) : (
              schemas.map((s) => (
                <option key={s.documentType} value={s.documentType}>
                  {s.documentType} (v{s.version})
                </option>
              ))
            )}
          </select>

          <label htmlFor="image-file">Image</label>
          <input id="image-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} />

          {previewUrl && (
            <img
              src={previewUrl}
              alt="preview"
              style={{ marginTop: 12, maxWidth: "100%", borderRadius: 8, border: "1px solid var(--border)" }}
            />
          )}

          <button className="primary" type="submit" disabled={!file || !documentType || loading}>
            {loading ? "Extracting…" : "Extract"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Result</h2>
        {!result && <div className="empty-state">Upload an image and click Extract to see the result here.</div>}

        {result?.kind === "error" && (
          <div className="banner error">
            {result.status ? `HTTP ${result.status}: ` : ""}
            {result.message}
          </div>
        )}

        {result?.kind === "discordant" && (
          <>
            <div className="banner warn">
              Models disagreed (match ratio {result.matchRatio.toFixed(2)}) — no result was accepted.
            </div>
            <h3>Mismatches</h3>
            <table className="mismatch-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Kind</th>
                  <th>Values per model</th>
                </tr>
              </thead>
              <tbody>
                {result.mismatches.map((m) => (
                  <tr key={m.field}>
                    <td>{m.field}</td>
                    <td>{m.kind}</td>
                    <td>
                      <pre className="json-view" style={{ margin: 0, maxHeight: 120 }}>
                        {JSON.stringify(m.values, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <MetadataGrid metadata={result.metadata} />
          </>
        )}

        {result?.kind === "ok" && (
          <>
            <div className="banner ok">Extraction accepted.</div>
            <h3>Data</h3>
            <pre className="json-view">{JSON.stringify(result.data, null, 2)}</pre>
            <MetadataGrid metadata={result.metadata} />
          </>
        )}
      </div>
    </div>
  );
}

function MetadataGrid({ metadata: m }: { metadata: ExtractionMetadataDto }) {
  return (
    <div className="meta-grid">
      <div className="stat">
        <div className="label">Models used</div>
        <div className="value">{m.modelsUsed.join(", ") || "—"}</div>
      </div>
      <div className="stat">
        <div className="label">Schema version</div>
        <div className="value">v{m.schemaVersion}</div>
      </div>
      <div className="stat">
        <div className="label">Time</div>
        <div className="value">{m.processingTimeMs} ms</div>
      </div>
      {m.modelsDropped.length > 0 && (
        <div className="stat" style={{ gridColumn: "1 / -1" }}>
          <div className="label">Dropped models</div>
          <div className="value">{m.modelsDropped.map((d) => `${d.modelId} (${d.reason})`).join("; ")}</div>
        </div>
      )}
    </div>
  );
}
