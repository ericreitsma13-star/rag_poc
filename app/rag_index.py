from __future__ import annotations

import argparse
import datetime
import logging
from pathlib import Path

from app.utils.bm25_store import BM25Store
from app.utils.chunking import chunk_text
from app.utils.config import SUPPORTED_EXTENSIONS, load_settings
from app.utils.index_state import fingerprint, is_changed, load_state, save_state
from app.utils.parsers import parse_file
from app.utils.qdrant_store import QdrantStore, point_id

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("rag_index")


def iter_files(data_dir: Path) -> list[Path]:
    files: list[Path] = []
    for path in data_dir.rglob("*"):
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS:
            files.append(path)
    return sorted(files)


def build_points(
    source_path: Path,
    chunks: list[str],
    vectors: list[list[float]],
    extra: dict | None = None,
) -> list[dict]:
    today = datetime.date.today().isoformat()
    file_type = source_path.suffix.lower().lstrip(".")

    payload_base: dict = {
        "source_path": str(source_path.resolve()),
        "file_name": source_path.name,
        "file_type": file_type,
        "indexed_at": today,
        "tag": "",
    }
    if extra:
        payload_base.update(extra)

    points: list[dict] = []
    for index, (text, vector) in enumerate(zip(chunks, vectors)):
        pid = point_id(str(source_path.resolve()), index)
        payload = {
            **payload_base,
            "chunk_index": index,
            "text": text,
            "citation": f"[{source_path.name}#{index}]",
        }
        points.append({"id": pid, "vector": vector, "payload": payload})
    return points


def index_documents(full_reindex: bool = False, tag: str = "") -> None:
    settings = load_settings()
    data_dir = settings.rag_data_dir
    if not data_dir.exists():
        raise FileNotFoundError(f"Data directory does not exist: {data_dir}")

    files = iter_files(data_dir)
    if not files:
        logger.warning("No supported files found in %s", data_dir)
        return

    state = load_state()

    from app.utils.embeddings import LocalEmbedder

    embedder = LocalEmbedder(settings.rag_embed_model)
    store = QdrantStore(settings.qdrant_url, settings.qdrant_collection)
    bm25 = BM25Store(settings.bm25_index_path)
    bm25.load()

    collection_ready = False
    indexed_count = 0

    for file_path in files:
        changed = full_reindex or is_changed(file_path, state)
        if not changed:
            logger.info("Skipping unchanged file: %s", file_path)
            continue

        parsed_parts = parse_file(file_path)
        if not parsed_parts:
            logger.info("Skipping empty/unreadable file: %s", file_path)
            continue

        merged_chunks: list[str] = []
        for part in parsed_parts:
            sub_chunks = chunk_text(part.text, settings.rag_chunk_chars, settings.rag_chunk_overlap)
            merged_chunks.extend(chunk.text for chunk in sub_chunks)

        if not merged_chunks:
            logger.info("No chunks produced for file: %s", file_path)
            continue

        vectors = embedder.embed_documents(merged_chunks)

        if not collection_ready:
            store.ensure_collection(vector_size=len(vectors[0]))
            collection_ready = True

        source_str = str(file_path.resolve())
        store.replace_document(source_str)

        extra: dict = {}
        if tag:
            extra["tag"] = tag

        points = build_points(file_path, merged_chunks, vectors, extra)
        store.upsert_points(points)

        # Update BM25 index
        chunk_texts = [p["payload"]["text"] for p in points]
        chunk_ids = [p["id"] for p in points]
        bm25.replace_document(source_str, chunk_texts, chunk_ids)

        fprint = fingerprint(file_path)
        state[fprint.source_path] = {
            "size": fprint.size,
            "mtime_ns": fprint.mtime_ns,
            "content_hash": fprint.content_hash,
        }
        indexed_count += 1
        logger.info("Indexed %d chunks for %s", len(points), file_path)

    bm25.save()
    save_state(state)
    logger.info("Indexing complete. Files indexed: %d", indexed_count)


def main() -> int:
    parser = argparse.ArgumentParser(description="Index local documents into Qdrant + BM25")
    parser.add_argument("--full-reindex", action="store_true", help="Reindex all files")
    parser.add_argument("--tag", default="", help="Custom tag stored in chunk payload")
    args = parser.parse_args()

    index_documents(full_reindex=args.full_reindex, tag=args.tag)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
