# Offline Local RAG (Python, Qdrant, Ollama)

This repository contains a CPU-first, offline-oriented RAG pipeline for NL + EN documents.

## Features
- Local parsing for PDF, DOCX, TXT, MD
- Character chunking with overlap
- Local embeddings with `sentence-transformers` (E5 prefixing)
- Qdrant vector storage with per-chunk metadata and citations
- Ollama-based answering (`mixtral:8x7b-instruct-v0.1-q4_K_M` default)
- Incremental indexing using file state fingerprints

## Project structure
- `app/rag_index.py` index files into Qdrant
- `app/rag_query.py` interactive and single-shot querying
- `app/utils/` config, parsers, chunking, embeddings, index state, qdrant store
- `tests/` basic unit tests for chunking, indexing payload, query context formatting

## Configuration
Set env vars as needed:
- `RAG_DATA_DIR` (default: `./data`, fallback `../data`, then `~/local-rag/data`)
- `QDRANT_URL` (default: `http://localhost:6333`)
- `QDRANT_COLLECTION` (default: `docs`)
- `RAG_EMBED_MODEL` (default: `intfloat/multilingual-e5-base`)
- `OLLAMA_URL` (default: `http://localhost:11434`)
- `OLLAMA_MODEL` (default: `mixtral:8x7b-instruct-v0.1-q4_K_M`)
- `RAG_TOP_K` (default: `6`)
- `RAG_CHUNK_CHARS` (default: `1800`)
- `RAG_CHUNK_OVERLAP` (default: `250`)

## Run
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
docker compose up -d
python -m app.rag_index
python -m app.rag_query "Wat staat er in de documentatie?"
```

Interactive mode:
```bash
python -m app.rag_query
```

Run tests:
```bash
pytest -q
```
