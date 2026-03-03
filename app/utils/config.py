from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:  # pragma: no cover
    load_dotenv = None


if load_dotenv is not None:
    load_dotenv()


SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}


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
    ollama_url: str
    ollama_model: str
    rag_top_k: int
    rag_chunk_chars: int
    rag_chunk_overlap: int



def load_settings() -> Settings:
    data_dir_raw = os.getenv("RAG_DATA_DIR")
    data_dir = Path(data_dir_raw).expanduser().resolve() if data_dir_raw else _default_data_dir()

    return Settings(
        rag_data_dir=data_dir,
        qdrant_url=os.getenv("QDRANT_URL", "http://localhost:6333"),
        qdrant_collection=os.getenv("QDRANT_COLLECTION", "docs"),
        rag_embed_model=os.getenv("RAG_EMBED_MODEL", "intfloat/multilingual-e5-base"),
        ollama_url=os.getenv("OLLAMA_URL", "http://localhost:1234"),
        ollama_model=os.getenv("OLLAMA_MODEL", "gemma-3-12b-it"),
        rag_top_k=int(os.getenv("RAG_TOP_K", "6")),
        rag_chunk_chars=int(os.getenv("RAG_CHUNK_CHARS", "1800")),
        rag_chunk_overlap=int(os.getenv("RAG_CHUNK_OVERLAP", "250")),
    )
