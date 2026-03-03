import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });
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
