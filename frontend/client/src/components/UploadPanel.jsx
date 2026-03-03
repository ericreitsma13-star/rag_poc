import React, { useState, useRef, useEffect, useCallback } from "react";
import { uploadFiles, startIndexing, getFiles } from "../lib/api.js";

const S = {
  panel: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "var(--surface)",
    borderLeft: "1px solid var(--border)",
  },
  header: {
    padding: "16px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: "13px", fontWeight: 600, color: "var(--text)" },
  body: { flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" },

  dropzone: {
    border: "2px dashed var(--border-2)",
    borderRadius: "var(--radius-lg)",
    padding: "24px 16px",
    textAlign: "center",
    cursor: "pointer",
    transition: "border-color var(--transition), background var(--transition)",
    color: "var(--text-2)",
    fontSize: "13px",
  },
  dropzoneActive: {
    borderColor: "var(--accent)",
    background: "var(--accent-light)",
  },

  fileList: { display: "flex", flexDirection: "column", gap: "4px" },
  fileItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 8px",
    borderRadius: "var(--radius)",
    background: "var(--surface-2)",
    fontSize: "12px",
    color: "var(--text-2)",
  },
  fileName: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--mono)" },
  fileSize: { color: "var(--text-3)", flexShrink: 0 },
  ext: {
    flexShrink: 0,
    padding: "1px 5px",
    borderRadius: "3px",
    fontSize: "10px",
    fontWeight: 600,
    textTransform: "uppercase",
    fontFamily: "var(--mono)",
  },

  indexSection: { display: "flex", flexDirection: "column", gap: "8px" },
  tagInput: {
    height: "32px",
    padding: "0 10px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    background: "var(--surface-2)",
    color: "var(--text)",
    width: "100%",
  },
  indexBtn: {
    height: "34px",
    padding: "0 14px",
    background: "var(--text)",
    color: "#fff",
    borderRadius: "var(--radius)",
    fontSize: "13px",
    fontWeight: 500,
    width: "100%",
  },

  log: {
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "8px 10px",
    maxHeight: "160px",
    overflowY: "auto",
    fontFamily: "var(--mono)",
    fontSize: "11px",
    color: "var(--text-2)",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  logLine: { lineHeight: 1.5 },
  logWarn: { color: "var(--warn)" },
  logDone: { color: "var(--success)", fontWeight: 600 },

  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "18px",
    height: "18px",
    borderRadius: "99px",
    background: "var(--accent-light)",
    color: "var(--accent)",
    fontSize: "10px",
    fontWeight: 700,
  },
};

const EXT_COLORS = {
  pdf:  { bg: "#fee2e2", color: "#b91c1c" },
  docx: { bg: "#dbeafe", color: "#1d4ed8" },
  xlsx: { bg: "#dcfce7", color: "#15803d" },
  md:   { bg: "#f3e8ff", color: "#7c3aed" },
  txt:  { bg: "#f1f5f9", color: "#475569" },
};

function formatSize(bytes) {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024*1024)  return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1024/1024).toFixed(1)} MB`;
}

export default function UploadPanel() {
  const [dragging, setDragging]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [indexing, setIndexing]   = useState(false);
  const [tag, setTag]             = useState("");
  const [logs, setLogs]           = useState([]);
  const [files, setFiles]         = useState([]);
  const inputRef  = useRef();
  const logEndRef = useRef();

  const refreshFiles = useCallback(async () => {
    try { const d = await getFiles(); setFiles(d.files || []); } catch {}
  }, []);

  useEffect(() => { refreshFiles(); }, [refreshFiles]);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer?.files || []);
    if (!dropped.length) return;
    await doUpload(dropped);
  }, []);

  const doUpload = async (fileList) => {
    setUploading(true);
    try {
      await uploadFiles(fileList);
      await refreshFiles();
    } catch (err) {
      setLogs((p) => [...p, { text: `Upload error: ${err.message}`, level: "warn" }]);
    } finally {
      setUploading(false);
    }
  };

  const doIndex = () => {
    setIndexing(true);
    setLogs([]);
    startIndexing(
      { tag: tag.trim() || undefined },
      {
        onLog:  (text, level) => setLogs((p) => [...p, { text, level }]),
        onDone: (code) => {
          setLogs((p) => [...p, { text: code === 0 ? "✓ Indexing complete" : `Exited with code ${code}`, level: code === 0 ? "done" : "warn" }]);
          setIndexing(false);
          refreshFiles();
        },
        onError: (err) => {
          setLogs((p) => [...p, { text: `Error: ${err}`, level: "warn" }]);
          setIndexing(false);
        },
      }
    ).catch((err) => {
      setLogs((p) => [...p, { text: `Failed to start: ${err.message}`, level: "warn" }]);
      setIndexing(false);
    });
  };

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <span style={S.title}>Documents</span>
        {files.length > 0 && <span style={S.badge}>{files.length}</span>}
      </div>

      <div style={S.body}>
        {/* Dropzone */}
        <div
          style={{ ...S.dropzone, ...(dragging ? S.dropzoneActive : {}) }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,.xlsx"
            style={{ display: "none" }}
            onChange={(e) => doUpload(Array.from(e.target.files))}
          />
          {uploading ? (
            <span style={{ color: "var(--accent)" }}>Uploading…</span>
          ) : (
            <>
              <div style={{ fontSize: "20px", marginBottom: "6px" }}>↑</div>
              <div>Drop files here or click to browse</div>
              <div style={{ fontSize: "11px", marginTop: "4px", color: "var(--text-3)" }}>
                PDF · DOCX · XLSX · MD · TXT
              </div>
            </>
          )}
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div style={S.fileList}>
            {files.map((f) => {
              const ext = f.name.split(".").pop().toLowerCase();
              const c = EXT_COLORS[ext] || EXT_COLORS.txt;
              return (
                <div key={f.name} style={S.fileItem}>
                  <span style={{ ...S.ext, background: c.bg, color: c.color }}>{ext}</span>
                  <span style={S.fileName}>{f.name}</span>
                  <span style={S.fileSize}>{formatSize(f.size)}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Index section */}
        <div style={S.indexSection}>
          <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>
            Index
          </div>
          <input
            style={S.tagInput}
            placeholder="Optional tag (e.g. finance)"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            disabled={indexing}
          />
          <button style={S.indexBtn} onClick={doIndex} disabled={indexing}>
            {indexing ? "Indexing…" : "Run indexer"}
          </button>
        </div>

        {/* Log output */}
        {logs.length > 0 && (
          <div style={S.log}>
            {logs.map((l, i) => (
              <div key={i} style={{ ...S.logLine, ...(l.level === "warn" ? S.logWarn : l.level === "done" ? S.logDone : {}) }}>
                {l.text}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
