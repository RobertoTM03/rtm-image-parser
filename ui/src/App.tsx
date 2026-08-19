import { useState } from "react";
import SchemasPage from "./pages/SchemasPage";
import ExtractPage from "./pages/ExtractPage";
import HistoryPage from "./pages/HistoryPage";

type Tab = "extract" | "schemas" | "history";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export default function App() {
  const [tab, setTab] = useState<Tab>("extract");

  return (
    <>
      <header className="app-header">
        <h1>Document Extractor</h1>
        <span className="api-base">{API_BASE_URL}</span>
      </header>

      <nav className="tabs">
        <button className={tab === "extract" ? "active" : ""} onClick={() => setTab("extract")}>
          Extract
        </button>
        <button className={tab === "schemas" ? "active" : ""} onClick={() => setTab("schemas")}>
          Schemas
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          History
        </button>
      </nav>

      {tab === "extract" && <ExtractPage />}
      {tab === "schemas" && <SchemasPage />}
      {tab === "history" && <HistoryPage />}
    </>
  );
}
