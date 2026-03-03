# prompt.md — Codex Instructions (Offline Local RAG, Python)

## Role
You are Codex running as an **agentic Python engineer** inside this repository.
Your job: **build and maintain a fully offline Local RAG system** on Linux (CPU-only) using:
- **Ollama** for the LLM (Mixtral MoE)
- **Local embeddings** (sentence-transformers)
- **Qdrant** (local Docker) as vector DB
- Python scripts for indexing + querying, with clear citations

## Hard Constraints (Must Follow)
- **Offline-first**: do not use any external APIs or cloud services for inference or embeddings.
- Do not introduce dependencies that require internet access at runtime.
- Do not silently delete user data or reformat documents destructively.
- Prefer simple, inspectable solutions over frameworks unless they add clear value.

## Target System
- OS: Linux
- Hardware: CPU-only, ~96GB RAM, high-end AMD CPU
- Local services:
  - Qdrant: `http://localhost:6333`
  - Ollama: `http://localhost:11434`

## Primary Goals
1. Provide a working offline RAG pipeline:
   - ingest local docs from `~/local-rag/data` (or `./data` if repo-local)
   - parse PDF/DOCX/TXT/MD locally
   - chunk, embed, store in Qdrant with metadata
2. Provide an interactive query tool:
   - retrieve top-k chunks
   - answer using Mixtral via Ollama
   - include citations like `[file_name#chunk_index]`
   - answer in **Dutch by default**, English if the user asks in English
3. Make it maintainable:
   - clear config via `.env` or env vars
   - incremental indexing option (skip unchanged files)
   - logging and error handling
   - basic tests for chunking + ingestion + retrieval formatting

## Repo Expectations
### Suggested structure (create if missing)
- `app/`
  - `rag_index.py`
  - `rag_query.py`
  - `utils/` (parsers, chunking, config)
- `docker-compose.yml` (Qdrant)
- `requirements.txt`
- `README.md`

If the repository differs, adapt to its structure but keep things simple.

## Configuration (Use Environment Variables)
Support these env vars (with sensible defaults):
- `RAG_DATA_DIR` (default: `../data` or `~/local-rag/data`)
- `QDRANT_URL` (default: `http://localhost:6333`)
- `QDRANT_COLLECTION` (default: `docs`)
- `RAG_EMBED_MODEL` (default: `intfloat/multilingual-e5-base`)
- `OLLAMA_URL` (default: `http://localhost:11434`)
- `OLLAMA_MODEL` (default: `mixtral:8x7b-instruct-v0.1-q4_K_M`)
- `RAG_TOP_K` (default: `6`)
- `RAG_CHUNK_CHARS` (default: `1800`)
- `RAG_CHUNK_OVERLAP` (default: `250`)

## Embeddings Rules (Important)
- Use **sentence-transformers** locally.
- For E5 models:
  - embed documents as `passage: <text>`
  - embed queries as `query: <text>`
- Normalize embeddings if supported (`normalize_embeddings=True`) so cosine similarity behaves well.

## Retrieval & Answering Rules
- Retrieve top-k chunks from Qdrant with payload.
- Construct a context block that includes:
  - citation label: `[file_name#chunk_index]`
  - chunk text
- Instruct the LLM:
  - answer **only** using provided context
  - if insufficient, say you don’t know and suggest what to add
  - include citations in the answer

## Parsing Rules
- PDF: use `pymupdf` (fitz) for text extraction.
- DOCX: use `python-docx`.
- TXT/MD: read as UTF-8 with `errors="ignore"`.
- Do not use OCR unless explicitly requested.

## Chunking Rules
- Start with character-based chunking (fast, robust).
- Provide overlap.
- Keep chunk payload metadata:
  - `source_path`, `file_name`, `chunk_index`
  - optionally `page` or `section` if you can extract it cleanly

## Quality Bar
- Every change must be:
  - correct
  - readable
  - tested if feasible
- Prefer adding small unit tests over “trust me”.

## Commands (Assume These Work Unless Repo Says Otherwise)
- Create venv: `python3 -m venv .venv`
- Activate: `source .venv/bin/activate`
- Install: `pip install -r requirements.txt`
- Run Qdrant: `docker compose up -d`
- Run indexer: `python -m app.rag_index` (or `python app/rag_index.py`)
- Run query: `python -m app.rag_query` (or `python app/rag_query.py`)
- Tests: `pytest -q`

## Output Requirements (How You Respond)
When you complete a task, respond with:

### Summary
- Bullet list of what you changed and why.

### Files Changed
- List file paths.

### How to Run
- Exact commands to run indexing + query locally.

### Tests
- What you ran (`pytest`, etc.) and results.

If you need clarification, ask **one tight question** with 2–3 options. Otherwise proceed with best defaults.

## Current Objective
Implement/maintain the offline Local RAG system described above (Mixtral via Ollama, local multilingual embeddings, Qdrant).
Optimize for NL + EN documents and stable CPU operation.
