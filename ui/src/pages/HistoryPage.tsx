import { useEffect, useState } from "react";
import { listExtractionLogs } from "../api";
import type { ExtractionLogDto } from "../api";

function statusPillClass(status: ExtractionLogDto["status"]): string {
  if (status === "ok") return "pill ok";
  if (status === "discordant") return "pill warn";
  return "pill error";
}

export default function HistoryPage() {
  const [logs, setLogs] = useState<ExtractionLogDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    setError(null);
    listExtractionLogs(10)
      .then(setLogs)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  return (
    <div className="card">
      <div className="actions-row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Recent requests</h2>
        <button className="secondary" onClick={refresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <div className="banner error">{error}</div>}

      {!loading && !error && logs.length === 0 && (
        <div className="empty-state">No extraction requests yet.</div>
      )}

      {logs.length > 0 && (
        <table className="mismatch-table">
          <thead>
            <tr>
              <th>Created</th>
              <th>Document type</th>
              <th>Version</th>
              <th>Status</th>
              <th>Confidence</th>
              <th>Crosscheck</th>
              <th>Models used</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.createdAt).toLocaleString()}</td>
                <td>{log.documentType}</td>
                <td>v{log.schemaVersion}</td>
                <td>
                  <span className={statusPillClass(log.status)}>{log.status}</span>
                </td>
                <td>{log.confidence !== null ? log.confidence.toFixed(2) : "—"}</td>
                <td>
                  {log.crosscheckPassed === null ? "—" : log.crosscheckPassed ? (
                    <span className="pill ok">passed</span>
                  ) : (
                    <span className="pill error">failed</span>
                  )}
                </td>
                <td>{log.modelsUsed.join(", ")}</td>
                <td>{log.processingTimeMs} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
