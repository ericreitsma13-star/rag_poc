from __future__ import annotations

from unittest.mock import MagicMock

from app.utils.reranker import CrossEncoderReranker


def _make_reranker(scores: list[float]) -> CrossEncoderReranker:
    """Create a CrossEncoderReranker with a mocked model (no disk access)."""
    mock_model = MagicMock()
    mock_model.predict.return_value = scores
    reranker = CrossEncoderReranker.__new__(CrossEncoderReranker)
    reranker._model = mock_model
    return reranker


def test_rerank_orders_by_score():
    reranker = _make_reranker([0.1, 0.9, 0.5])
    candidates = [
        {"text": "low relevance", "file_name": "a.txt"},
        {"text": "high relevance", "file_name": "b.txt"},
        {"text": "medium relevance", "file_name": "c.txt"},
    ]
    result = reranker.rerank("query", candidates, top_k=3)
    assert result[0]["file_name"] == "b.txt"
    assert result[1]["file_name"] == "c.txt"
    assert result[2]["file_name"] == "a.txt"


def test_rerank_top_k_limits_output():
    reranker = _make_reranker([0.3, 0.9, 0.1, 0.7])
    candidates = [{"text": f"t{i}"} for i in range(4)]
    result = reranker.rerank("q", candidates, top_k=2)
    assert len(result) == 2
    # Best two are index 1 (0.9) and index 3 (0.7)
    assert result[0]["text"] == "t1"
    assert result[1]["text"] == "t3"


def test_rerank_empty_candidates():
    reranker = _make_reranker([])
    result = reranker.rerank("query", [], top_k=5)
    assert result == []


def test_rerank_preserves_payload():
    reranker = _make_reranker([0.8])
    candidates = [{"text": "hello", "file_name": "doc.pdf", "chunk_index": 7}]
    result = reranker.rerank("q", candidates, top_k=1)
    assert result[0]["file_name"] == "doc.pdf"
    assert result[0]["chunk_index"] == 7
