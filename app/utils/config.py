from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:  # pragma: no cover
    load_dotenv = None


if load_dotenv is not None:
    load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")


SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".xlsx"}


def _default_data_dir() -> Path:
    repo_data = Path("./data").resolve()
    parent_data = Path("../data").resolve()
    if repo_data.exists():
        return repo_data
    if parent_data.exists():
        return parent_data
    return (Path.home() / "local-rag" / "data").resolve()


@dataclass(frozen=True)
class Settings:
    rag_data_dir: Path
    qdrant_url: str
    qdrant_collection: str
    rag_embed_model: str
    rag_rerank_model: str
    lmstudio_url: str
    lmstudio_model: str
    rag_top_k: int
    rag_candidate_k: int
    rag_chunk_chars: int
    rag_chunk_overlap: int
    bm25_index_path: Path
    df_agent_max_rows: int


def load_settings() -> Settings:
    data_dir_raw = os.getenv("RAG_DATA_DIR")
    data_dir = Path(data_dir_raw).expanduser().resolve() if data_dir_raw else _default_data_dir()

    bm25_raw = os.getenv("BM25_INDEX_PATH", "./bm25_index.pkl")
    bm25_path = Path(bm25_raw).expanduser().resolve()

    return Settings(
        rag_data_dir=data_dir,
        qdrant_url=os.getenv("QDRANT_URL", "http://localhost:6333"),
        qdrant_collection=os.getenv("QDRANT_COLLECTION", "docs"),
        rag_embed_model=os.getenv("RAG_EMBED_MODEL", "intfloat/multilingual-e5-base"),
        rag_rerank_model=os.getenv(
            "RAG_RERANK_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2"
        ),
        # Support both LMSTUDIO_* and legacy OLLAMA_* env vars
        lmstudio_url=os.getenv("LMSTUDIO_URL") or os.getenv("OLLAMA_URL", "http://localhost:1234"),
        lmstudio_model=os.getenv("LMSTUDIO_MODEL") or os.getenv(
            "OLLAMA_MODEL", "qwen3-30b-a3b-instruct-2507:2"
        ),
        rag_top_k=int(os.getenv("RAG_TOP_K", "6")),
        rag_candidate_k=int(os.getenv("RAG_CANDIDATE_K", "20")),
        rag_chunk_chars=int(os.getenv("RAG_CHUNK_CHARS", "1800")),
        rag_chunk_overlap=int(os.getenv("RAG_CHUNK_OVERLAP", "250")),
        bm25_index_path=bm25_path,
        df_agent_max_rows=int(os.getenv("DF_AGENT_MAX_ROWS", "50000")),
    )
