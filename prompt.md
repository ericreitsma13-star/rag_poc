# prompt.md — Offline Local RAG System (Python, CPU-only)

## What This Builds

A **fully offline Retrieval-Augmented Generation (RAG) pipeline** that lets you ask questions
about your own documents and get cited answers — no cloud, no API keys, no internet required.

### System Overview

```
Your Documents (PDF/DOCX/TXT/MD/XLSX)
         │
         ▼
  [rag_index.py]  ←── parse → chunk → embed (E5) + BM25 index
         │
         ▼
  Qdrant (Docker) ←── vector store + metadata store
  BM25 index      ←── keyword index (local file)
         │
         ▼
  [rag_query.py]  ←── hybrid search (vector + BM25) → rerank → LLM
         │
         ▼
  Answer in NL/EN with citations [file_name#chunk_index]
```

### Components

| Component | Role | Technology |
|---|---|---|
| Embedding model | Local dense vectors | `intfloat/multilingual-e5-base` via sentence-transformers |
| Keyword index | Sparse BM25 retrieval | `rank_bm25` (local file, no server needed) |
| Vector store | Stores vectors + metadata | Qdrant (Docker, local) |
| Reranker | Cross-encoder re-scoring | `cross-encoder/ms-marco-MiniLM-L-6-v2` (CPU) |
| LLM | Generates answers from context | LM Studio (OpenAI-compatible API) |
| Document parsers | Extracts text from files | PyMuPDF, python-docx, openpyxl, plain UTF-8 |
| Data analyst agent | Runs calculations on XLSX data | pandas + LLM-generated Python, executed locally |

### What You Get
- **Index once** — run `rag_index.py` over your `~/local-rag/data` folder
- **Query anytime** — ask in Dutch or English, get cited answers
- **Hybrid retrieval** — vector search + BM25 keyword search, fused before reranking
- **Cross-encoder reranking** — removes noise from top-k results before LLM sees them
- **Metadata filtering** — filter by filename, file type, date, or custom tags at query time
- **Incremental updates** — re-index only changed/new files
- **XLSX calculations** — ask aggregation questions against spreadsheets; LLM writes pandas code, system executes it safely and returns the result
- **Fully offline** — nothing leaves your machine after initial model downloads

---

## Role

Build and maintain a **fully offline Local RAG system** on Linux (CPU-only) using:
- **LM Studio** for LLM inference (OpenAI-compatible REST API at `http://localhost:1234/v1`)
- **sentence-transformers** for local dense embeddings
- **rank_bm25** for local sparse keyword retrieval
- **cross-encoder** for reranking retrieved chunks
- **Qdrant** (local Docker) as the vector database
- Python scripts for indexing and querying, with clear `[file#chunk]` citations

---

## Hard Constraints

- **Offline-first**: no external APIs or cloud services at runtime.
- No dependencies that require internet access during operation.
- Never silently delete or destructively reformat user documents.
- Prefer simple, inspectable solutions over heavy frameworks unless there is a clear benefit.

---

## Target System

- OS: Linux (Ubuntu)
- Hardware: CPU-only, ~96 GB RAM, high-end AMD CPU
- Local services:
  - Qdrant: `http://localhost:6333`
  - LM Studio: `http://localhost:1234/v1`

---

## Primary Goals

### 1. Indexing Pipeline (`rag_index.py`)
- Read documents from `~/local-rag/data` (or `./data`)
- Parse PDF, DOCX, TXT, MD, XLSX locally
- Chunk text with overlap
- Embed each chunk using the local E5 model → store in Qdrant with metadata
- Build and persist a **BM25 index** from all chunk texts alongside Qdrant
- Support incremental indexing (skip unchanged files via file fingerprint)

### 2. Query Tool (`rag_query.py`)

**Retrieval pipeline (in order):**

1. **Hybrid search**: run both dense vector search (Qdrant) and BM25 keyword search in parallel, retrieve top-`RAG_CANDIDATE_K` candidates from each
2. **Fusion**: merge and deduplicate candidates using **Reciprocal Rank Fusion (RRF)**
3. **Reranking**: score the fused set with a cross-encoder, keep top-`RAG_TOP_K`
4. **Metadata filtering** (optional): apply Qdrant payload filters before vector search
5. **Context assembly**: build citation block from reranked chunks
6. **LLM call**: send context + question to LM Studio

**Answer behaviour:**
- Include inline citations like `[invoice_2023.pdf#3]`
- **Answer in Dutch by default; switch to English if the user asks in English**
- If context is insufficient, say so clearly and suggest what documents to add

### 3. Metadata Filtering
Support filter parameters at query time (CLI flags or interactive prompts):
- `--file <name>` — restrict retrieval to a specific file
- `--filetype <pdf|docx|md|txt|xlsx>` — restrict by file type
- `--since <YYYY-MM-DD>` — only chunks from files indexed after this date
- `--tag <value>` — match a custom tag stored in chunk payload at index time

Filters are passed as Qdrant payload filters before vector search, so irrelevant documents are never scored.

### 4. Maintainability
- Config via `.env` or environment variables (see below)
- Logging and error handling throughout
- Basic unit tests for chunking, ingestion, retrieval formatting, hybrid fusion, and reranking

---

## Repository Structure

```
local-rag/
├── app/
│   ├── rag_index.py              # Indexing entrypoint
│   ├── rag_query.py              # Query entrypoint
│   └── utils/
│       ├── config.py             # Env var loading
│       ├── parsers.py            # PDF/DOCX/TXT/MD/XLSX extraction
│       ├── chunker.py            # Character chunking with overlap
│       ├── embeddings.py         # E5 embed_documents / embed_query
│       ├── bm25_store.py         # BM25 index build, persist, search
│       ├── reranker.py           # Cross-encoder reranking
│       ├── hybrid.py             # RRF fusion logic
│       ├── qdrant_store.py       # Qdrant upsert / search / filter
│       ├── index_state.py        # File fingerprint tracking
│       └── df_agent.py           # Data analyst agent (pandas code gen + sandboxed exec)
├── data/                         # Your documents go here
├── tests/
│   ├── test_chunker.py
│   ├── test_parsers.py
│   ├── test_retrieval.py
│   ├── test_hybrid_fusion.py
│   ├── test_reranker.py
│   └── test_df_agent.py
├── frontend/
│   ├── package.json              # Root: concurrently runs server + client
│   ├── .env.example
│   ├── server/
│   │   ├── index.js              # Express API bridge (calls Python subprocesses)
│   │   └── package.json
│   └── client/
│       ├── index.html
│       ├── vite.config.js        # Proxies /api → localhost:3001
│       └── src/
│           ├── App.jsx           # Layout: sidebar + topbar + chat
│           ├── index.css
│           ├── main.jsx
│           ├── lib/api.js        # fetch wrappers for all API endpoints
│           ├── hooks/useChatHistory.js
│           └── components/
│               ├── ChatPanel.jsx     # Chat interface with suggestion chips
│               ├── ChatMessage.jsx   # Bubble renderer + inline citation chips
│               ├── FilterBar.jsx     # Filetype / file / date / tag filters
│               └── UploadPanel.jsx   # Drag-drop upload + indexer with live log
├── docker-compose.yml            # Qdrant service
├── requirements.txt
├── .env.example
└── README.md
```

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `RAG_DATA_DIR` | `~/local-rag/data` | Folder of documents to index |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant endpoint |
| `QDRANT_COLLECTION` | `docs` | Collection name |
| `RAG_EMBED_MODEL` | `intfloat/multilingual-e5-base` | Local dense embedding model |
| `RAG_RERANK_MODEL` | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Local cross-encoder for reranking |
| `LMSTUDIO_URL` | `http://localhost:1234/v1` | LM Studio OpenAI-compatible endpoint |
| `LMSTUDIO_MODEL` | `mixtral` | Model identifier as shown in LM Studio |
| `RAG_TOP_K` | `6` | Final number of chunks after reranking |
| `RAG_CANDIDATE_K` | `20` | Candidates fetched per retriever before fusion |
| `RAG_CHUNK_CHARS` | `1800` | Target chunk size in characters |
| `RAG_CHUNK_OVERLAP` | `250` | Overlap between consecutive chunks |
| `BM25_INDEX_PATH` | `./bm25_index.pkl` | Path to persist the BM25 index |

---

## LLM Inference (LM Studio)

LM Studio exposes an OpenAI-compatible API. Use the `openai` Python package:

```python
import openai

client = openai.OpenAI(
    base_url=os.getenv("LMSTUDIO_URL", "http://localhost:1234/v1"),
    api_key="lm-studio"  # any non-empty string; LM Studio ignores it
)

response = client.chat.completions.create(
    model=os.getenv("LMSTUDIO_MODEL", "mixtral"),
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": question}
    ]
)
answer = response.choices[0].message.content
```

Ensure the LM Studio local server is running and a model is loaded before calling `rag_query.py`.

---

## Embeddings

- Use **sentence-transformers** locally; no API calls.
- For E5 models, prefix correctly:
  - Documents: `passage: <text>`
  - Queries: `query: <text>`
- Use `normalize_embeddings=True` so cosine similarity is reliable.

---

## Hybrid Search & Fusion

### BM25 (keyword)
- Build a `BM25Okapi` index over all chunk texts at index time.
- Persist to disk (`BM25_INDEX_PATH`) so it survives restarts.
- At query time, score all chunks and return top-`RAG_CANDIDATE_K` by BM25 rank.

### Dense (vector)
- Query Qdrant with the E5-embedded question.
- Apply any requested metadata filters as Qdrant payload filters.
- Return top-`RAG_CANDIDATE_K` by cosine similarity.

### Reciprocal Rank Fusion
Combine both ranked lists:
```python
def rrf(rankings: list[list[str]], k: int = 60) -> dict[str, float]:
    scores = {}
    for ranking in rankings:
        for rank, doc_id in enumerate(ranking):
            scores[doc_id] = scores.get(doc_id, 0) + 1 / (k + rank + 1)
    return dict(sorted(scores.items(), key=lambda x: x[1], reverse=True))
```
Keep the top-`RAG_CANDIDATE_K` fused candidates for reranking.

---

## Reranking

Use a **cross-encoder** to rescore all fused candidates against the query:

```python
from sentence_transformers import CrossEncoder

model = CrossEncoder(os.getenv("RAG_RERANK_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2"))
pairs = [(query, chunk.text) for chunk in candidates]
scores = model.predict(pairs)
reranked = sorted(zip(candidates, scores), key=lambda x: x[1], reverse=True)
top_chunks = [c for c, _ in reranked[:RAG_TOP_K]]
```

The cross-encoder reads query and chunk together, catching relevance that vector similarity alone misses. On CPU with 96 GB RAM, `MiniLM-L-6` reruns quickly even on 20 candidates.

---

## Metadata Filtering

Store this payload with every chunk in Qdrant:

```python
{
    "source_path": "/home/eric/local-rag/data/invoice_q3.pdf",
    "file_name":   "invoice_q3.pdf",
    "file_type":   "pdf",           # pdf | docx | txt | md | xlsx
    "chunk_index": 3,
    "indexed_at":  "2025-06-01",    # ISO date string
    "page":        2,               # if extractable
    "tag":         ""               # optional custom tag
}
```

Apply filters as Qdrant `Filter` objects before the vector search:

```python
from qdrant_client.models import Filter, FieldCondition, MatchValue

filters = Filter(must=[
    FieldCondition(key="file_type", match=MatchValue(value="pdf")),
    FieldCondition(key="tag",       match=MatchValue(value="finance"))
])
```

---

## Document Parsing

| Format | Library | Notes |
|---|---|---|
| PDF | `pymupdf` (fitz) | Text-only; no OCR unless explicitly requested |
| DOCX | `python-docx` | Extract paragraphs and tables |
| XLSX | `openpyxl` | Row-per-chunk; include sheet name and row range in metadata |
| TXT / MD | Built-in `open()` | UTF-8, `errors="ignore"` |

**XLSX note**: treat each row (or configurable N rows) as a chunk. Store sheet name and row range in payload so results are filterable and citable.

Never use OCR by default.

---

## Chunking

- Character-based chunking (fast and robust).
- Apply overlap (`RAG_CHUNK_OVERLAP`) to preserve context across boundaries.
- Chunk payload stored in Qdrant:
  - `source_path`, `file_name`, `file_type`, `chunk_index`
  - `indexed_at` (ISO date)
  - `page` or `section` — if cleanly extractable
  - `tag` — optional, set via CLI at index time with `--tag <value>`

---

## Data Analyst Agent (`df_agent.py`)

XLSX files have two access modes in this system:

| Mode | When | How |
|---|---|---|
| RAG (text) | "What does row 14 say about supplier X?" | Chunk rows as text → embed → retrieve → cite |
| Analyst agent | "What is the average invoice value?" | Load full sheet as DataFrame → LLM writes pandas → execute → return result |

The query router in `rag_query.py` decides which mode to use based on whether the question implies a **calculation** (sum, average, count, filter, max, min, group by) versus a **lookup**.

### How It Works

1. The user asks a calculation question, optionally scoped to a file: `--file invoices_2024.xlsx`
2. The system loads the target XLSX into a **pandas DataFrame**
3. The LLM receives the column names, dtypes, and a sample of 3 rows (no full data sent)
4. The LLM returns a pandas expression or short Python snippet
5. The system executes it in a **restricted sandbox** (no file I/O, no imports beyond pandas/numpy)
6. The result is returned to the user with the source file cited

### Sandbox Rules

Execute generated code with a restricted globals dict — never `exec` with full builtins:

```python
import pandas as pd
import numpy as np
import ast

ALLOWED_BUILTINS = {"len", "range", "sum", "min", "max", "round", "abs", "print"}

def safe_exec(code: str, df: pd.DataFrame) -> str:
    tree = ast.parse(code)
    # Reject any import statements or attribute access to os/sys/subprocess
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            raise ValueError("Imports not allowed in generated code")
    local_ns = {"df": df, "pd": pd, "np": np}
    exec(compile(tree, "<generated>", "exec"), {"__builtins__": {b: __builtins__[b] for b in ALLOWED_BUILTINS if b in __builtins__}}, local_ns)
    return str(local_ns.get("result", "No variable named 'result' found"))
```

The LLM is instructed to always assign its final answer to a variable called `result`.

### LLM Prompt for Code Generation

```
You are a pandas expert. Given the following DataFrame schema and sample:

Columns: {columns}
Dtypes:  {dtypes}
Sample (3 rows):
{sample}

Write a short Python snippet using only pandas and numpy to answer this question:
"{question}"

Rules:
- Do not import anything.
- Assign your final answer to a variable called `result`.
- `result` must be a scalar, list, or small DataFrame — not the full dataset.
- If the question cannot be answered from this data, set result = "Cannot answer: <reason>"
```

### Query Routing Logic

In `rag_query.py`, detect analyst-mode questions with a simple keyword check before hitting the retrieval pipeline:

```python
CALC_KEYWORDS = {"sum", "total", "average", "gemiddelde", "totaal", "count", "aantal",
                 "max", "min", "highest", "lowest", "hoogste", "laagste", "group", "per"}

def is_calculation_query(question: str) -> bool:
    tokens = set(question.lower().split())
    return bool(tokens & CALC_KEYWORDS)
```

If `True` and `--file` points to an XLSX, route to `df_agent`. Otherwise use the standard RAG pipeline.

### New env var

| Variable | Default | Description |
|---|---|---|
| `DF_AGENT_MAX_ROWS` | `50000` | Max rows loaded into memory for agent queries |

---

## Frontend (Node.js + Express + React/Vite)

A local web UI that talks to the Python RAG backend via an Express API bridge.

### Architecture

```
Browser (React/Vite :5173)
    │  /api/*  proxied →
Express server (:3001)
    │  spawns
Python subprocesses (rag_query.py, rag_index.py)
    │
Qdrant + BM25 + LM Studio
```

The Express server never calls Python directly for inference — it spawns the existing CLI scripts as subprocesses. This keeps the Python side independent and testable on its own.

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/query` | Body: `{ question, filetype?, file?, since?, tag? }` → `{ answer, citations[] }` |
| `POST` | `/api/upload` | `multipart/form-data` with `files[]` → saves to `RAG_DATA_DIR` |
| `POST` | `/api/index` | Body: `{ tag? }` → SSE stream of log lines + `{ done, code }` |
| `GET`  | `/api/files` | Lists files in `RAG_DATA_DIR` with size and modified date |
| `GET`  | `/api/health` | Basic liveness check |

### Python output contract

`rag_query.py` must print a single JSON object to stdout when called with a question argument:

```json
{
  "answer": "De gemiddelde factuurwaarde is €4.230 [invoices_2024.xlsx#12].",
  "citations": [
    { "label": "invoices_2024.xlsx#12", "file": "invoices_2024.xlsx", "chunk": 12 }
  ]
}
```

If `rag_query.py` is not yet JSON-aware, the server falls back to treating stdout as plain text with an empty citations array. Update `rag_query.py` to emit JSON when a CLI argument is present (non-interactive mode).

### Features
- **Chat interface** — persistent message history, Shift+Enter for newlines, suggestion chips on empty state
- **Inline citation chips** — `[file#chunk]` references in answers rendered as hoverable chips with tooltip
- **Filter bar** — filetype select, file name input, indexed-since date picker, tag input; active filters shown in topbar
- **Document sidebar** — drag-and-drop upload, file list with type badges and sizes, indexer trigger with optional tag and live log stream
- **API health indicator** — green/red dot in topbar

### Frontend env vars (in `frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Express server port |
| `RAG_DATA_DIR` | `~/local-rag/data` | Document directory |
| `PYTHON_BIN` | `../../.venv/bin/python` | Python binary in venv |
| `RAG_ROOT` | `../..` | Root of the rag_poc repo |

---

## Quality Standards

- Every change must be **correct**, **readable**, and **tested where feasible**.
- Add unit tests for any new utility (hybrid fusion, reranker wrapper, BM25 store).
- Log meaningful events: files parsed, chunks indexed, candidates per retriever, rerank scores, errors.
- Fail loudly with clear messages rather than silently skipping data.

---

## Commands

```bash
# Setup
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Start Qdrant
docker compose up -d

# Index documents (with optional tag)
python -m app.rag_index
python -m app.rag_index --tag finance

# Query — interactive
python -m app.rag_query

# Query — single shot with filters
python -m app.rag_query "Wat staat er in het inkoopbeleid?" --filetype pdf --tag finance
python -m app.rag_query "Summarise the Q3 results" --file report_q3.xlsx

# Query — analyst mode (calculations on XLSX)
python -m app.rag_query "Wat is de gemiddelde factuurwaarde?" --file invoices_2024.xlsx
python -m app.rag_query "Which supplier has the highest total?" --file invoices_2024.xlsx

# Frontend (from frontend/ directory)
cd frontend
cp .env.example .env          # edit RAG_DATA_DIR, PYTHON_BIN, RAG_ROOT
npm run install:all            # installs root + server + client deps
npm run dev                    # starts Express (:3001) + Vite (:5173) together
# then open http://localhost:5173

# Tests
pytest -q
```

---

## Output Format (How You Respond)

After completing any task, structure your response as:

### Summary
- Bullet list of what changed and why.

### Files Changed
- List of file paths modified or created.

### How to Run
- Exact commands to index and query locally.

### Tests
- What you ran and the results.

If clarification is needed, ask **one focused question** with 2–3 options. Otherwise proceed with sensible defaults.

---

## Current Objective

Extend the existing offline Local RAG system with these improvements (implement what is not yet present):

1. **LM Studio** — replace Ollama with LM Studio (`openai` package, `http://localhost:1234/v1`)
2. **Hybrid search** — add BM25 (`rank_bm25`) alongside Qdrant vector search, fuse with RRF
3. **Cross-encoder reranking** — rescore fused candidates with `ms-marco-MiniLM-L-6-v2` before sending to LLM
4. **Metadata filtering** — enrich chunk payloads and expose `--file`, `--filetype`, `--since`, `--tag` flags in `rag_query.py`
5. **XLSX parsing** — add `openpyxl` parser, row-based chunking, sheet name in metadata
6. **Data analyst agent** — add `df_agent.py` with pandas code generation, sandboxed execution, and query routing for calculation questions against XLSX files
7. **Frontend** — add `frontend/` with Express API bridge + React/Vite UI: chat interface, drag-drop upload, indexer with live log, filter bar, inline citation chips

Optimize for stable CPU operation with Dutch and English documents.
Prioritize correctness, simplicity, and fully local operation at every step.
