"use client";

import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!file) return;

    setError(null);
    setLoading(true);

    try {
      const text = await file.text();
      const rows = text
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean);

      const res = await fetch("/api/composers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // ignore JSON parse errors and fall back to generic message
      }

      if (!res.ok) {
        const message =
          (data && (data.error || data.message)) ||
          `Server error (${res.status}) while searching composers.`;
        throw new Error(message);
      }

      setResults((data && data.results) || []);
    } catch (err: any) {
      console.error(err);
      setResults([]);
      setError(
        err?.message ||
          "Something went wrong while searching. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!results || results.length === 0) return;

    // Column A, B, C..R, S
    const header = [
      "artist",
      "title",
      "song writer", // S
    ];

    const rows = results.map((r) => [
      r.artist, // A
      r.title, // B
      (r.composers || []).join("; "), // S
    ]);

    const escape = (v: any) => {
      const s = String(v ?? "");
      return `"${s.replace(/"/g, '""')}"`;
    };

    const csv = [header, ...rows]
      .map((row) => row.map(escape).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "composer-results.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-container">
      <div className="card">
        <div className="header">
          <div>
            <h1 className="title">🎼 Composer Finder</h1>
            <p className="subtitle">Upload a CSV with rows like: <strong>Artist - Title</strong></p>
          </div>
          <div style={{ textAlign: "right", minWidth: 120 }}>
            <div className="subtitle">Quick lookup · MusicBrainz + Spotify</div>
          </div>
        </div>

        <div className="controls">
          <label className="file-input">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setError(null);
              }}
            />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 3v10" stroke="#6b21a8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 7l4-4 4 4" stroke="#6b21a8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#6b21a8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>{file ? file.name : "Choose CSV file"}</span>
          </label>

          <div className="actions">
            <button
              className="btn primary"
              onClick={handleUpload}
              disabled={!file || loading}
            >
              {loading ? "Searching…" : "Start"}
            </button>

            <button
              className="btn ghost"
              onClick={exportCSV}
              disabled={!results || results.length === 0}
            >
              Export CSV
            </button>
          </div>
        </div>

        {loading && (
          <div
            className="progress"
            aria-label="Searching for composers"
            aria-busy="true"
          >
            <div className="progress-bar" />
          </div>
        )}

        {error && (
          <div className="alert" role="alert">
            <span>{error}</span>
            <button
              type="button"
              className="alert-close"
              aria-label="Dismiss error"
              onClick={() => setError(null)}
            >
              ×
            </button>
          </div>
        )}

        <div className="results">
          {results.length > 0 ? (
            <table className="results-table">
              <thead>
                <tr>
                  <th>Artist</th>
                  <th>Title</th>
                  <th>Composers</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => (
                  <tr key={idx}>
                    <td>{r.artist}</td>
                    <td>{r.title}</td>
                    <td>{(r.composers || []).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No results yet — upload a CSV and click Start.</div>
          )}
        </div>
      </div>
    </div>
  );
}
