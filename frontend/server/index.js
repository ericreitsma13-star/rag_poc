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
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".docx", ".txt", ".md", ".xlsx"];
    const ext = path.extname(file.originalname).toLowerCase();
    allowed.includes(ext) ? cb(null, true) : cb(new Error(`Unsupported file type: ${ext}`));
  },
});

// ── POST /api/query/stream ─────────────────────────────────────────────────
// Streams tokens as SSE. Each event: data: {"type":"token","content":"..."}
// Final event:           data: {"type":"citations","data":[...]}
app.post("/api/query/stream", (req, res) => {
  const { question, filetype, file, since, tag } = req.body;

  if (!question?.trim()) {
    return res.status(400).json({ error: "question is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering if behind proxy
  res.flushHeaders();

  const args = ["-m", "app.rag_query", question, "--stream"];
  if (filetype) args.push("--filetype", filetype);
  if (file)     args.push("--file",     file);
  if (since)    args.push("--since",    since);
  if (tag)      args.push("--tag",      tag);

  const proc = spawn(PYTHON_BIN, args, { cwd: RAG_ROOT });
  let buf = "";

  proc.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    // Process complete newline-delimited JSON lines
    const lines = buf.split("\n");
    buf = lines.pop(); // keep incomplete last line in buffer
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        JSON.parse(line); // validate JSON
        res.write(`data: ${line}\n\n`);
      } catch {
        // Not valid JSON — skip (could be logging output)
      }
    }
  });

  proc.stderr.on("data", (d) => {
    // Python logging goes to stderr — don't forward to client, just log here
    process.stderr.write(d);
  });

  proc.on("close", (code) => {
    // Flush remaining buffer
    if (buf.trim()) {
      try {
        JSON.parse(buf);
        res.write(`data: ${buf}\n\n`);
      } catch { /* skip */ }
    }
    res.write(`data: ${JSON.stringify({ type: "done", code })}\n\n`);
    res.end();
  });

  proc.on("error", (err) => {
    res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
    res.end();
  });

  // Clean up if client disconnects
  req.on("close", () => proc.kill());
});

// ── POST /api/query (non-streaming fallback) ───────────────────────────────
app.post("/api/query", (req, res) => {
  const { question, filetype, file, since, tag } = req.body;
  if (!question?.trim()) return res.status(400).json({ error: "question is required" });

  const args = ["-m", "app.rag_query", question];
  if (filetype) args.push("--filetype", filetype);
  if (file)     args.push("--file",     file);
  if (since)    args.push("--since",    since);
  if (tag)      args.push("--tag",      tag);

  const proc = spawn(PYTHON_BIN, args, { cwd: RAG_ROOT });
  let stdout = "", stderr = "";
  proc.stdout.on("data", (d) => { stdout += d.toString(); });
  proc.stderr.on("data", (d) => { stderr += d.toString(); });
  proc.on("close", (code) => {
    if (code !== 0) return res.status(500).json({ error: stderr || "Python process failed", code });
    try {
      res.json(JSON.parse(stdout.trim()));
    } catch {
      res.json({ answer: stdout.trim(), citations: [] });
    }
  });
  proc.on("error", (err) => res.status(500).json({ error: err.message }));
});

// ── POST /api/upload ───────────────────────────────────────────────────────
app.post("/api/upload", upload.array("files"), (req, res) => {
  const uploaded = req.files.map((f) => f.originalname);
  res.json({ uploaded, message: `${uploaded.length} file(s) saved to data directory.` });
});

// ── POST /api/index ────────────────────────────────────────────────────────
app.post("/api/index", (req, res) => {
  const { tag } = req.body || {};
  const args = ["-m", "app.rag_index"];
  if (tag) args.push("--tag", tag);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();

  const proc = spawn(PYTHON_BIN, args, { cwd: RAG_ROOT });
  proc.stdout.on("data", (d) => {
    d.toString().split("\n").filter(Boolean).forEach((line) =>
      res.write(`data: ${JSON.stringify({ log: line })}\n\n`)
    );
  });
  proc.stderr.on("data", (d) => {
    d.toString().split("\n").filter(Boolean).forEach((line) =>
      res.write(`data: ${JSON.stringify({ log: line, level: "warn" })}\n\n`)
    );
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
