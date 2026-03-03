# Offline Local RAG (Python · Qdrant · LM Studio)

A fully offline Retrieval-Augmented Generation pipeline for Dutch and English documents.
No cloud, no API keys, no internet required at runtime.

## Features

- **Document parsing** — PDF, DOCX, TXT, MD, XLSX (row-based chunking)
- **Local embeddings** — `intfloat/multilingual-e5-base` via sentence-transformers (E5 prefix convention)
- **Hybrid retrieval** — dense vector search (Qdrant) + BM25 keyword search, fused with Reciprocal Rank Fusion
- **Cross-encoder reranking** — `ms-marco-MiniLM-L-6-v2` rescores fused candidates before sending to LLM
- **Metadata filtering** — restrict retrieval by filename, file type, indexed date, or custom tag
- **Data analyst agent** — calculation questions against XLSX files: LLM writes pandas code, system executes it in a sandbox
- **Incremental indexing** — SHA-256 fingerprint tracking; only changed files are re-indexed
- **LM Studio** — OpenAI-compatible local inference (`http://localhost:1234/v1`)
- **Web UI** — React/Vite chat interface with drag-drop upload, live indexer log, filter bar, and citation chips

## Project structure

```
app/
  rag_index.py          Indexing entrypoint (Qdrant + BM25)
  rag_query.py          Query entrypoint (hybrid search → rerank → LLM)
  utils/
    config.py           Env var loading
    parsers.py          PDF / DOCX / TXT / MD / XLSX extraction
    chunking.py         Character chunking with overlap
    embeddings.py       E5 embed_documents / embed_query
    qdrant_store.py     Qdrant upsert / search / filter / fetch
    bm25_store.py       BM25 index build, persist, search
    reranker.py         Cross-encoder reranking wrapper
    hybrid.py           Reciprocal Rank Fusion
    df_agent.py         Pandas code gen + sandboxed execution for XLSX
    index_state.py      File fingerprint tracking
frontend/
  server/index.js       Express API bridge (spawns Python subprocesses)
  client/               React/Vite UI
tests/                  Unit tests (chunking, parsers, hybrid, reranker, df_agent, …)
docker-compose.yml      Qdrant service
requirements.txt
.env.example
```

## Configuration

Copy `.env.example` to `.env` and adjust as needed.

| Variable | Default | Description |
|---|---|---|
| `RAG_DATA_DIR` | `./data` | Folder of documents to index |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant endpoint |
| `QDRANT_COLLECTION` | `docs` | Collection name |
| `RAG_EMBED_MODEL` | `intfloat/multilingual-e5-base` | Local dense embedding model |
| `RAG_RERANK_MODEL` | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Local cross-encoder |
| `LMSTUDIO_URL` | `http://localhost:1234` | LM Studio endpoint |
| `LMSTUDIO_MODEL` | `qwen3-30b-a3b-instruct-2507:2` | Model as shown in LM Studio |
| `RAG_TOP_K` | `6` | Final chunks after reranking |
| `RAG_CANDIDATE_K` | `20` | Candidates per retriever before fusion |
| `RAG_CHUNK_CHARS` | `1800` | Target chunk size in characters |
| `RAG_CHUNK_OVERLAP` | `250` | Overlap between consecutive chunks |
| `BM25_INDEX_PATH` | `./bm25_index.pkl` | Path to persist the BM25 index |
| `DF_AGENT_MAX_ROWS` | `50000` | Max rows loaded for analyst agent queries |

## Run

```bash
# 1. Create venv and install dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. Start Qdrant
docker compose up -d

# 3. Index documents
python -m app.rag_index
python -m app.rag_index --tag finance   # with optional tag

# 4. Query — interactive REPL
python -m app.rag_query

# 4. Query — single shot with filters
python -m app.rag_query "Wat staat er in het inkoopbeleid?" --filetype pdf --tag finance
python -m app.rag_query "Wat is de gemiddelde factuurwaarde?" --file invoices.xlsx
```

## Web UI

```bash
cd frontend
cp .env.example .env          # set RAG_DATA_DIR, PYTHON_BIN, RAG_ROOT
npm run install:all            # installs root + server + client deps
npm run dev                    # Express :3001 + Vite :5173
# open http://localhost:5173
```

## Tests

```bash
pytest -q
# or with python3.11 directly (if pytest not on PATH):
python3.11 -m pytest tests/ -v
```
