from __future__ import annotations

from app.utils.hybrid import fuse_results, rrf


# ── rrf ───────────────────────────────────────────────────────────────────────

def test_rrf_single_list_preserves_order():
    result = rrf([["a", "b", "c"]])
    ids = list(result.keys())
    assert ids == ["a", "b", "c"]
    assert result["a"] > result["b"] > result["c"]


def test_rrf_boost_shared_id():
    # "shared" appears in both lists; "unique" in only one
    result = rrf([["unique", "shared"], ["shared"]])
    assert result["shared"] > result["unique"]


def test_rrf_symmetric_overlap():
    # "a" ranks first in list1, second in list2; "b" the reverse
    result = rrf([["a", "b"], ["b", "a"]])
    # Scores must be equal (by symmetry)
    assert abs(result["a"] - result["b"]) < 1e-9


def test_rrf_empty_rankings():
    assert rrf([]) == {}
    assert rrf([[]]) == {}


def test_rrf_score_decreases_with_rank():
    result = rrf([["x", "y", "z"]])
    assert result["x"] > result["y"] > result["z"]


# ── fuse_results ──────────────────────────────────────────────────────────────

class _FakeHit:
    """Mimics a Qdrant ScoredPoint with .id and .payload."""

    def __init__(self, id_: str, payload: dict):
        self.id = id_
        self.payload = payload


def test_fuse_results_merges_sources():
    hits = [_FakeHit("a", {"text": "alpha", "file_name": "f.txt"})]
    bm25_ids = ["b", "a"]
    fetched = {"b": {"text": "bravo", "file_name": "g.txt"}}

    results = fuse_results(hits, bm25_ids, fetched, top_k=5)
    ids = [r["_id"] for r in results]

    assert "a" in ids
    assert "b" in ids


def test_fuse_results_top_k_limits_output():
    hits = [_FakeHit(str(i), {"text": f"t{i}"}) for i in range(10)]
    bm25_ids = [str(i) for i in range(10)]
    results = fuse_results(hits, bm25_ids, {}, top_k=3)
    assert len(results) == 3


def test_fuse_results_no_candidates():
    results = fuse_results([], [], {}, top_k=5)
    assert results == []
