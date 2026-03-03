from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

from app.rag_query import format_context, run_query
from app.utils.index_state import fingerprint, is_changed, load_state
from app.utils.qdrant_store import point_id


# ── point_id ──────────────────────────────────────────────────────────────────

def test_point_id_is_deterministic():
    assert point_id("/data/file.txt", 0) == point_id("/data/file.txt", 0)


def test_point_id_differs_by_chunk():
    assert point_id("/data/file.txt", 0) != point_id("/data/file.txt", 1)


def test_point_id_differs_by_path():
    assert point_id("/data/a.txt", 0) != point_id("/data/b.txt", 0)


def test_point_id_is_uuid_string():
    import uuid

    pid = point_id("/data/file.txt", 3)
    assert isinstance(pid, str)
    uuid.UUID(pid)  # should not raise — valid UUID format


# ── format_context ────────────────────────────────────────────────────────────

def test_format_context_empty_list():
    assert format_context([]) == ""


def test_format_context_fallback_citation():
    result = format_context([{"file_name": "x.pdf", "chunk_index": 1, "text": "hello"}])
    assert "[x.pdf#1]" in result
    assert "hello" in result


# ── index_state fingerprint / is_changed ─────────────────────────────────────

def test_fingerprint_fields(tmp_path: Path):
    f = tmp_path / "doc.txt"
    f.write_text("content", encoding="utf-8")

    fp = fingerprint(f)

    assert fp.source_path == str(f.resolve())
    assert fp.size == f.stat().st_size
    assert len(fp.content_hash) == 64  # sha256 hex


def test_is_changed_new_file(tmp_path: Path):
    f = tmp_path / "new.txt"
    f.write_text("data", encoding="utf-8")

    assert is_changed(f, {}) is True


def test_is_changed_unchanged_file(tmp_path: Path):
    f = tmp_path / "stable.txt"
    f.write_text("data", encoding="utf-8")

    fp = fingerprint(f)
    state = {
        fp.source_path: {
            "size": fp.size,
            "mtime_ns": fp.mtime_ns,
            "content_hash": fp.content_hash,
        }
    }

    assert is_changed(f, state) is False


def test_is_changed_after_modification(tmp_path: Path):
    f = tmp_path / "changed.txt"
    f.write_text("original", encoding="utf-8")

    fp = fingerprint(f)
    state = {
        fp.source_path: {
            "size": fp.size,
            "mtime_ns": fp.mtime_ns,
            "content_hash": fp.content_hash,
        }
    }

    f.write_text("modified content", encoding="utf-8")

    assert is_changed(f, state) is True


# ── run_query: no-context path ────────────────────────────────────────────────

def test_run_query_returns_no_context_message():
    import sys

    mock_embedder_instance = MagicMock()
    mock_embedder_instance.embed_query.return_value = [0.0] * 768

    mock_embedder_cls = MagicMock(return_value=mock_embedder_instance)

    mock_store = MagicMock()
    mock_store.search.return_value = []

    # sentence_transformers may not be installed; inject a fake module so the
    # lazy `from app.utils.embeddings import LocalEmbedder` inside run_query
    # resolves without actually loading the real library.
    fake_embeddings_mod = MagicMock()
    fake_embeddings_mod.LocalEmbedder = mock_embedder_cls

    with (
        patch.dict(sys.modules, {"app.utils.embeddings": fake_embeddings_mod}),
        patch("app.rag_query.QdrantStore", return_value=mock_store),
    ):
        result = run_query("Wat is dit?")

    # run_query now returns {"answer": "...", "citations": [...]}
    assert isinstance(result, dict)
    answer = result["answer"]
    assert "weet" in answer.lower() or "niet" in answer.lower()
