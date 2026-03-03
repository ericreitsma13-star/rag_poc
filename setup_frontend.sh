#!/usr/bin/env bash
set -e
echo "Creating frontend directory structure..."
mkdir -p frontend/server
mkdir -p frontend/client/src/components
mkdir -p frontend/client/src/hooks
mkdir -p frontend/client/src/lib
mkdir -p frontend/client/public
echo "Writing files..."
cat > "frontend/package.json" << 'EOF_5a772589'
{
  "name": "rag-frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "install:all": "npm install && cd server && npm install && cd ../client && npm install",
    "dev": "concurrently -n \"api,ui\" -c \"blue,green\" \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "cd server && node --watch index.js",
    "dev:client": "cd client && npx vite --port 5173",
    "build": "cd client && npx vite build",
    "start": "cd server && node index.js"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
EOF_5a772589
echo "  wrote frontend/package.json"
cat > "frontend/.env.example" << 'EOF_b3e06f68'
# Express API server port (default: 3001)
PORT=3001

# Absolute path to your RAG data directory
RAG_DATA_DIR=/home/yourname/local-rag/data

# Path to the Python binary in your venv
PYTHON_BIN=/home/yourname/local-rag/.venv/bin/python

# Root of the rag_poc repo (where app/ lives)
RAG_ROOT=/home/yourname/local-rag/rag_poc
EOF_b3e06f68
echo "  wrote frontend/.env.example"
cat > "frontend/server/package.json" << 'EOF_aa2ab4f1'
{
  "name": "rag-api-server",
  "version": "1.0.0",
  "type": "module",
  "description": "Express API bridge for the offline Local RAG system",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1"
  }
}
EOF_aa2ab4f1
echo "  wrote frontend/server/package.json"
cat > "frontend/server/index.js" << 'EOF_2f0beddc'
import express from "express";
import cors from "cors";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Config from env
const RAG_DATA_DIR = process.env.RAG_DATA_DIR || path.join(process.env.HOME, "local-rag", "data");
const PYTHON_BIN   = process.env.PYTHON_BIN   || path.join(__dirname, "../../.venv/bin/python");
const RAG_ROOT     = process.env.RAG_ROOT     || path.join(__dirname, "../..");

app.use(cors());
app.use(express.json());

// ── File upload storage ────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(RAG_DATA_DIR, { recursive: true });
    cb(null, RAG_DATA_DIR);
  },
  filename: (_req, file, cb) => cb(null, file.originalname),
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".docx", ".txt", ".md", ".xlsx"];
    const ext = path.extname(file.originalname).toLowerCase();
    allowed.includes(ext) ? cb(null, true) : cb(new Error(`Unsupported file type: ${ext}`));
  },
});

// ── Helper: run Python module and stream output ────────────────────────────
function runPython(args, res, onDone) {
  const proc = spawn(PYTHON_BIN, args, { cwd: RAG_ROOT });
  let stdout = "";
  let stderr = "";

  proc.stdout.on("data", (d) => { stdout += d.toString(); });
  proc.stderr.on("data", (d) => { stderr += d.toString(); });

  proc.on("close", (code) => {
    if (code !== 0) {
      return res.status(500).json({ error: stderr || "Python process failed", code });
    }
    onDone(stdout, stderr);
  });

  proc.on("error", (err) => {
    res.status(500).json({ error: `Failed to spawn Python: ${err.message}` });
  });
}

// ── POST /api/query ────────────────────────────────────────────────────────
// Body: { question, filetype?, file?, since?, tag? }
app.post("/api/query", (req, res) => {
  const { question, filetype, file, since, tag } = req.body;

  if (!question?.trim()) {
    return res.status(400).json({ error: "question is required" });
  }

  const args = ["-m", "app.rag_query", question];
  if (filetype) args.push("--filetype", filetype);
  if (file)     args.push("--file", file);
  if (since)    args.push("--since", since);
  if (tag)      args.push("--tag", tag);

  runPython(args, res, (stdout) => {
    // rag_query.py prints JSON: { answer, citations: [{label, file, chunk}] }
    // Fall back to raw text if not JSON
    try {
      const parsed = JSON.parse(stdout.trim());
      res.json(parsed);
    } catch {
      res.json({ answer: stdout.trim(), citations: [] });
    }
  });
});

// ── POST /api/upload ───────────────────────────────────────────────────────
app.post("/api/upload", upload.array("files"), (req, res) => {
  const uploaded = req.files.map((f) => f.originalname);
  res.json({ uploaded, message: `${uploaded.length} file(s) saved to data directory.` });
});

// ── POST /api/index ────────────────────────────────────────────────────────
// Body: { tag? }  — triggers rag_index.py
app.post("/api/index", (req, res) => {
  const { tag } = req.body || {};
  const args = ["-m", "app.rag_index"];
  if (tag) args.push("--tag", tag);

  // Stream progress as newline-delimited JSON events
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();

  const proc = spawn(PYTHON_BIN, args, { cwd: RAG_ROOT });

  proc.stdout.on("data", (d) => {
    const lines = d.toString().split("\n").filter(Boolean);
    lines.forEach((line) => res.write(`data: ${JSON.stringify({ log: line })}\n\n`));
  });
  proc.stderr.on("data", (d) => {
    const lines = d.toString().split("\n").filter(Boolean);
    lines.forEach((line) => res.write(`data: ${JSON.stringify({ log: line, level: "warn" })}\n\n`));
  });
  proc.on("close", (code) => {
    res.write(`data: ${JSON.stringify({ done: true, code })}\n\n`);
    res.end();
  });
  proc.on("error", (err) => {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  });
});

// ── GET /api/files ─────────────────────────────────────────────────────────
app.get("/api/files", (_req, res) => {
  try {
    fs.mkdirSync(RAG_DATA_DIR, { recursive: true });
    const files = fs.readdirSync(RAG_DATA_DIR)
      .filter((f) => [".pdf", ".docx", ".txt", ".md", ".xlsx"].includes(path.extname(f).toLowerCase()))
      .map((f) => {
        const stat = fs.statSync(path.join(RAG_DATA_DIR, f));
        return { name: f, size: stat.size, modified: stat.mtime };
      });
    res.json({ files, dir: RAG_DATA_DIR });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/health ────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", dataDir: RAG_DATA_DIR });
});

app.listen(PORT, () => {
  console.log(`RAG API server running on http://localhost:${PORT}`);
  console.log(`Data dir: ${RAG_DATA_DIR}`);
});
EOF_2f0beddc
echo "  wrote frontend/server/index.js"
cat > "frontend/client/package.json" << 'EOF_ab4dc869'
{
  "name": "rag-client",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 5173",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.0.0"
  }
}
EOF_ab4dc869
echo "  wrote frontend/client/package.json"
cat > "frontend/client/index.html" << 'EOF_c7cb6af2'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Local RAG</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
EOF_c7cb6af2
echo "  wrote frontend/client/index.html"
cat > "frontend/client/vite.config.js" << 'EOF_962eed61'
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
EOF_962eed61
echo "  wrote frontend/client/vite.config.js"
cat > "frontend/client/src/main.jsx" << 'EOF_4e5b7eca'
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
EOF_4e5b7eca
echo "  wrote frontend/client/src/main.jsx"
cat > "frontend/client/src/index.css" << 'EOF_a8a34388'
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:          #f9f9f8;
  --surface:     #ffffff;
  --surface-2:   #f3f3f1;
  --border:      #e4e4e0;
  --border-2:    #d0d0cc;
  --text:        #1a1a18;
  --text-2:      #5a5a56;
  --text-3:      #9a9a96;
  --accent:      #2563eb;
  --accent-light:#eff6ff;
  --accent-2:    #1d4ed8;
  --warn:        #d97706;
  --warn-light:  #fffbeb;
  --success:     #16a34a;
  --success-light:#f0fdf4;
  --danger:      #dc2626;
  --mono:        "IBM Plex Mono", monospace;
  --sans:        "IBM Plex Sans", sans-serif;
  --radius:      6px;
  --radius-lg:   10px;
  --shadow:      0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04);
  --shadow-md:   0 4px 12px rgba(0,0,0,.08), 0 2px 4px rgba(0,0,0,.04);
  --transition:  150ms ease;
}

html, body { height: 100%; }

body {
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.6;
  color: var(--text);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}

button {
  font-family: var(--sans);
  cursor: pointer;
  border: none;
  outline: none;
  transition: background var(--transition), color var(--transition), opacity var(--transition);
}

button:disabled { opacity: 0.5; cursor: not-allowed; }

input, select, textarea {
  font-family: var(--sans);
  font-size: 14px;
  outline: none;
  transition: border-color var(--transition), box-shadow var(--transition);
}

input:focus, select:focus, textarea:focus {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 3px rgba(37,99,235,.1);
}

::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 99px; }

/* Animations */
@keyframes fadeIn   { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes spin     { to { transform: rotate(360deg); } }
@keyframes pulse    { 0%,100% { opacity:1; } 50% { opacity:.4; } }
@keyframes shimmer  {
  0%   { background-position: -400px 0; }
  100% { background-position:  400px 0; }
}

.fade-in { animation: fadeIn 200ms ease both; }
EOF_a8a34388
echo "  wrote frontend/client/src/index.css"
cat > "frontend/client/src/App.jsx" << 'EOF_9f452d11'
import React, { useState } from "react";
import ChatPanel from "./components/ChatPanel.jsx";
import UploadPanel from "./components/UploadPanel.jsx";

const SIDEBAR_W = 280;

const S = {
  app: {
    display: "flex",
    height: "100vh",
    overflow: "hidden",
    fontFamily: "var(--sans)",
  },

  sidebar: {
    width: `${SIDEBAR_W}px`,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    background: "var(--surface)",
    borderRight: "1px solid var(--border)",
    overflow: "hidden",
    transition: "width 200ms ease, opacity 200ms ease",
  },
  sidebarHidden: {
    width: 0,
    opacity: 0,
    pointerEvents: "none",
  },

  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },

  topbar: {
    height: "48px",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "0 16px",
    borderBottom: "1px solid var(--border)",
    background: "var(--surface)",
  },

  logo: {
    fontFamily: "var(--mono)",
    fontWeight: 500,
    fontSize: "13px",
    color: "var(--text)",
    letterSpacing: "-.01em",
  },
  logoAccent: { color: "var(--accent)" },

  toggleBtn: {
    height: "28px",
    padding: "0 10px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    background: "transparent",
    color: "var(--text-2)",
    fontSize: "12px",
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: "5px",
  },

  spacer: { flex: 1 },

  statusDot: (ok) => ({
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: ok ? "var(--success)" : "var(--danger)",
    flexShrink: 0,
  }),
  statusLabel: {
    fontSize: "11px",
    color: "var(--text-3)",
  },
};

function useServerHealth() {
  const [ok, setOk] = React.useState(null);
  React.useEffect(() => {
    fetch("/api/health")
      .then((r) => setOk(r.ok))
      .catch(() => setOk(false));
  }, []);
  return ok;
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filters, setFilters] = useState({ filetype: "", file: "", since: "", tag: "" });
  const healthy = useServerHealth();

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div style={S.app}>
      {/* Sidebar — Upload & Index */}
      <div style={{ ...S.sidebar, ...(sidebarOpen ? {} : S.sidebarHidden) }}>
        <UploadPanel />
      </div>

      {/* Main area */}
      <div style={S.main}>
        {/* Topbar */}
        <div style={S.topbar}>
          <button
            style={S.toggleBtn}
            onClick={() => setSidebarOpen((v) => !v)}
            title="Toggle document panel"
          >
            {sidebarOpen ? "← Hide" : "→ Docs"}
          </button>

          <span style={S.logo}>
            <span style={S.logoAccent}>rag</span>
            _poc
          </span>

          {activeFilterCount > 0 && (
            <span style={{ fontSize: "11px", color: "var(--accent)", fontWeight: 500 }}>
              {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
            </span>
          )}

          <div style={S.spacer} />

          {healthy !== null && (
            <>
              <div style={S.statusDot(healthy)} />
              <span style={S.statusLabel}>{healthy ? "API ready" : "API offline"}</span>
            </>
          )}
        </div>

        {/* Chat */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <ChatPanel filters={filters} onFiltersChange={setFilters} />
        </div>
      </div>
    </div>
  );
}
EOF_9f452d11
echo "  wrote frontend/client/src/App.jsx"
cat > "frontend/client/src/lib/api.js" << 'EOF_abfb732c'
const BASE = "/api";

export async function query(params) {
  const res = await fetch(`${BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function uploadFiles(files) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const res = await fetch(`${BASE}/upload`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getFiles() {
  const res = await fetch(`${BASE}/files`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Returns an EventSource-like stream; call onLog(line, level), onDone(code)
export function startIndexing({ tag } = {}, { onLog, onDone, onError }) {
  return fetch(`${BASE}/index`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag }),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.log)  onLog?.(ev.log, ev.level || "info");
            if (ev.done) onDone?.(ev.code);
            if (ev.error) onError?.(ev.error);
          } catch { /* skip malformed */ }
        }
      }
    };
    return pump();
  });
}
EOF_abfb732c
echo "  wrote frontend/client/src/lib/api.js"
cat > "frontend/client/src/hooks/useChatHistory.js" << 'EOF_8948ba98'
import { useState, useCallback } from "react";

export function useChatHistory() {
  const [messages, setMessages] = useState([]);

  const addUser = useCallback((text) => {
    const msg = { id: Date.now(), role: "user", text };
    setMessages((prev) => [...prev, msg]);
    return msg.id;
  }, []);

  const addAssistant = useCallback((answer, citations = []) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now() + 1, role: "assistant", text: answer, citations },
    ]);
  }, []);

  const addError = useCallback((text) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now() + 2, role: "error", text },
    ]);
  }, []);

  const clear = useCallback(() => setMessages([]), []);

  return { messages, addUser, addAssistant, addError, clear };
}
EOF_8948ba98
echo "  wrote frontend/client/src/hooks/useChatHistory.js"
cat > "frontend/client/src/components/FilterBar.jsx" << 'EOF_40e0b15d'
import React from "react";

const S = {
  bar: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    background: "var(--surface)",
  },
  group: { display: "flex", flexDirection: "column", gap: "3px", minWidth: "120px" },
  label: { fontSize: "11px", fontWeight: 500, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em" },
  input: {
    height: "30px",
    padding: "0 8px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    background: "var(--surface-2)",
    color: "var(--text)",
    fontSize: "13px",
    width: "100%",
  },
  select: {
    height: "30px",
    padding: "0 8px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    background: "var(--surface-2)",
    color: "var(--text)",
    fontSize: "13px",
    appearance: "none",
    cursor: "pointer",
    paddingRight: "24px",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%239a9a96'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 8px center",
  },
  clearBtn: {
    alignSelf: "flex-end",
    height: "30px",
    padding: "0 10px",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    color: "var(--text-2)",
    fontSize: "12px",
    fontWeight: 500,
  },
};

export default function FilterBar({ filters, onChange }) {
  const set = (key) => (e) => onChange({ ...filters, [key]: e.target.value });
  const clear = () => onChange({ filetype: "", file: "", since: "", tag: "" });
  const hasAny = Object.values(filters).some(Boolean);

  return (
    <div style={S.bar}>
      <div style={S.group}>
        <span style={S.label}>File type</span>
        <select style={S.select} value={filters.filetype} onChange={set("filetype")}>
          <option value="">All types</option>
          <option value="pdf">PDF</option>
          <option value="docx">DOCX</option>
          <option value="xlsx">XLSX</option>
          <option value="md">Markdown</option>
          <option value="txt">Text</option>
        </select>
      </div>

      <div style={S.group}>
        <span style={S.label}>File name</span>
        <input
          style={S.input}
          placeholder="e.g. invoice_q3.pdf"
          value={filters.file}
          onChange={set("file")}
        />
      </div>

      <div style={S.group}>
        <span style={S.label}>Indexed since</span>
        <input
          type="date"
          style={S.input}
          value={filters.since}
          onChange={set("since")}
        />
      </div>

      <div style={S.group}>
        <span style={S.label}>Tag</span>
        <input
          style={S.input}
          placeholder="e.g. finance"
          value={filters.tag}
          onChange={set("tag")}
        />
      </div>

      {hasAny && (
        <button style={S.clearBtn} onClick={clear}>
          Clear filters
        </button>
      )}
    </div>
  );
}
EOF_40e0b15d
echo "  wrote frontend/client/src/components/FilterBar.jsx"
cat > "frontend/client/src/components/ChatMessage.jsx" << 'EOF_19dada58'
import React, { useState } from "react";

const S = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    animation: "fadeIn 200ms ease both",
  },
  userWrap: { alignItems: "flex-end" },
  assistantWrap: { alignItems: "flex-start" },

  bubble: {
    maxWidth: "72%",
    padding: "10px 14px",
    borderRadius: "var(--radius-lg)",
    lineHeight: 1.65,
    fontSize: "14px",
    wordBreak: "break-word",
  },
  userBubble: {
    background: "var(--accent)",
    color: "#fff",
    borderBottomRightRadius: "3px",
  },
  assistantBubble: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    borderBottomLeftRadius: "3px",
    boxShadow: "var(--shadow)",
  },
  errorBubble: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    borderBottomLeftRadius: "3px",
  },

  citations: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "8px",
    paddingTop: "8px",
    borderTop: "1px solid var(--border)",
  },
  citationChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 8px",
    background: "var(--accent-light)",
    border: "1px solid #bfdbfe",
    borderRadius: "99px",
    fontSize: "11px",
    fontFamily: "var(--mono)",
    color: "var(--accent-2)",
    cursor: "pointer",
    transition: "background var(--transition)",
  },

  citeTooltip: {
    position: "relative",
    display: "inline-block",
  },
  tooltip: {
    position: "absolute",
    bottom: "calc(100% + 6px)",
    left: "50%",
    transform: "translateX(-50%)",
    background: "var(--text)",
    color: "#fff",
    fontSize: "11px",
    padding: "4px 8px",
    borderRadius: "var(--radius)",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    zIndex: 10,
  },

  meta: {
    fontSize: "11px",
    color: "var(--text-3)",
    paddingLeft: "4px",
  },
};

function CitationChip({ citation }) {
  const [hover, setHover] = useState(false);
  const label = citation.label || `${citation.file}#${citation.chunk}`;
  const title = citation.file ? `${citation.file} · chunk ${citation.chunk}` : label;

  return (
    <div
      style={S.citeTooltip}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span style={S.citationChip}>
        <span style={{ opacity: 0.6 }}>[</span>
        {label}
        <span style={{ opacity: 0.6 }}>]</span>
      </span>
      {hover && <div style={S.tooltip}>{title}</div>}
    </div>
  );
}

// Render inline citation tags like [foo.pdf#3] as styled chips
function AnswerText({ text, citations }) {
  if (!citations?.length) return <span>{text}</span>;

  // Build a set of labels for quick lookup
  const labelMap = {};
  citations.forEach((c) => { labelMap[c.label] = c; });

  // Replace [label] patterns with chips
  const parts = [];
  const pattern = /\[([^\]]+)\]/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const label = match[1];
    const cit = labelMap[label] || { label };
    parts.push(<CitationChip key={`${label}-${match.index}`} citation={cit} />);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return <span style={{ lineHeight: 1.8 }}>{parts}</span>;
}

export default function ChatMessage({ message }) {
  const { role, text, citations } = message;

  const wrapStyle = {
    ...S.wrap,
    ...(role === "user" ? S.userWrap : S.assistantWrap),
  };

  const bubbleStyle = {
    ...S.bubble,
    ...(role === "user"      ? S.userBubble :
        role === "error"     ? S.errorBubble :
                               S.assistantBubble),
  };

  return (
    <div style={wrapStyle}>
      <div style={bubbleStyle}>
        {role === "assistant"
          ? <AnswerText text={text} citations={citations} />
          : <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>
        }

        {role === "assistant" && citations?.length > 0 && (
          <div style={S.citations}>
            {citations.map((c, i) => (
              <CitationChip key={i} citation={c} />
            ))}
          </div>
        )}
      </div>
      <span style={S.meta}>
        {role === "user" ? "you" : role === "error" ? "error" : "rag"}
      </span>
    </div>
  );
}
EOF_19dada58
echo "  wrote frontend/client/src/components/ChatMessage.jsx"
cat > "frontend/client/src/components/ChatPanel.jsx" << 'EOF_ac642a0b'
import React, { useState, useRef, useEffect } from "react";
import { query } from "../lib/api.js";
import { useChatHistory } from "../hooks/useChatHistory.js";
import ChatMessage from "./ChatMessage.jsx";
import FilterBar from "./FilterBar.jsx";

const S = {
  panel: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "var(--bg)",
  },

  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "24px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },

  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    color: "var(--text-3)",
    userSelect: "none",
  },
  emptyIcon: { fontSize: "28px", opacity: 0.4 },
  emptyTitle: { fontSize: "14px", fontWeight: 500, color: "var(--text-2)" },
  emptyHint: { fontSize: "12px" },

  suggestions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    justifyContent: "center",
    marginTop: "12px",
    padding: "0 16px",
  },
  suggestion: {
    padding: "5px 12px",
    border: "1px solid var(--border)",
    borderRadius: "99px",
    background: "var(--surface)",
    color: "var(--text-2)",
    fontSize: "12px",
    cursor: "pointer",
    transition: "border-color var(--transition), color var(--transition)",
  },

  inputArea: {
    borderTop: "1px solid var(--border)",
    background: "var(--surface)",
    padding: "12px 16px",
  },

  inputRow: {
    display: "flex",
    gap: "8px",
    alignItems: "flex-end",
  },

  textarea: {
    flex: 1,
    resize: "none",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    padding: "8px 12px",
    fontSize: "14px",
    lineHeight: 1.5,
    color: "var(--text)",
    background: "var(--surface-2)",
    minHeight: "40px",
    maxHeight: "120px",
    overflowY: "auto",
    fontFamily: "var(--sans)",
  },

  sendBtn: {
    height: "40px",
    width: "40px",
    flexShrink: 0,
    background: "var(--accent)",
    color: "#fff",
    borderRadius: "var(--radius-lg)",
    fontSize: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  clearBtn: {
    height: "40px",
    width: "40px",
    flexShrink: 0,
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    color: "var(--text-3)",
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  thinking: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 14px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    borderBottomLeftRadius: "3px",
    width: "fit-content",
    boxShadow: "var(--shadow)",
  },
  dot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "var(--text-3)",
    animation: "pulse 1.2s ease-in-out infinite",
  },
};

const SUGGESTIONS = [
  "Wat staat er in het inkoopbeleid?",
  "Summarise the Q3 report",
  "Wat is de gemiddelde factuurwaarde?",
  "List all suppliers mentioned",
];

function ThinkingBubble() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <div style={S.thinking}>
        {[0, 200, 400].map((delay) => (
          <div key={delay} style={{ ...S.dot, animationDelay: `${delay}ms` }} />
        ))}
      </div>
    </div>
  );
}

export default function ChatPanel({ filters, onFiltersChange }) {
  const { messages, addUser, addAssistant, addError, clear } = useChatHistory();
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const bottomRef               = useRef();
  const textareaRef             = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const submit = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput("");
    addUser(q);
    setLoading(true);
    try {
      const activeFilters = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v)
      );
      const result = await query({ question: q, ...activeFilters });
      addAssistant(result.answer, result.citations);
    } catch (err) {
      addError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const autoResize = (e) => {
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  return (
    <div style={S.panel}>
      <FilterBar filters={filters} onChange={onFiltersChange} />

      <div style={S.messages}>
        {messages.length === 0 ? (
          <div style={S.empty}>
            <div style={S.emptyIcon}>⌕</div>
            <div style={S.emptyTitle}>Ask anything about your documents</div>
            <div style={S.emptyHint}>Dutch or English · citations included</div>
            <div style={S.suggestions}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  style={S.suggestion}
                  onClick={() => submit(s)}
                  onMouseEnter={(e) => { e.target.style.borderColor = "var(--accent)"; e.target.style.color = "var(--accent)"; }}
                  onMouseLeave={(e) => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--text-2)"; }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <ChatMessage key={m.id} message={m} />)
        )}
        {loading && <ThinkingBubble />}
        <div ref={bottomRef} />
      </div>

      <div style={S.inputArea}>
        <div style={S.inputRow}>
          {messages.length > 0 && (
            <button
              style={S.clearBtn}
              onClick={clear}
              title="Clear chat"
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            >
              ✕
            </button>
          )}
          <textarea
            ref={textareaRef}
            style={S.textarea}
            placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(e); }}
            onKeyDown={onKey}
            rows={1}
            disabled={loading}
          />
          <button
            style={{ ...S.sendBtn, opacity: (!input.trim() || loading) ? 0.4 : 1 }}
            onClick={() => submit()}
            disabled={!input.trim() || loading}
            title="Send"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
EOF_ac642a0b
echo "  wrote frontend/client/src/components/ChatPanel.jsx"
cat > "frontend/client/src/components/UploadPanel.jsx" << 'EOF_7c26a7b8'
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
EOF_7c26a7b8
echo "  wrote frontend/client/src/components/UploadPanel.jsx"

echo ""
echo "Done! Next steps:"
echo "  cd frontend"
echo "  cp .env.example .env"
echo "  nano .env   # set RAG_ROOT, PYTHON_BIN, RAG_DATA_DIR"
echo "  npm run install:all"
echo "  npm run dev"
