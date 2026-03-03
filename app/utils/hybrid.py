from __future__ import annotations


def rrf(rankings: list[list[str]], k: int = 60) -> dict[str, float]:
    """
    Reciprocal Rank Fusion over multiple ranked lists of document IDs.

    Returns a dict mapping doc_id → fused score (descending order).
    Higher score = more relevant.
    """
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, doc_id in enumerate(ranking):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
    return dict(sorted(scores.items(), key=lambda x: x[1], reverse=True))


def fuse_results(
    vector_hits: list,
    bm25_ids: list[str],
    fetched_payloads: dict[str, dict],
    top_k: int,
    k: int = 60,
) -> list[dict]:
    """
    Fuse Qdrant vector results and BM25 results via RRF.

    Args:
        vector_hits: List of Qdrant ScoredPoint objects (have .id and .payload).
        bm25_ids: Ranked list of point ID strings from BM25 search.
        fetched_payloads: Mapping of point_id (str) → payload dict for every
            candidate ID (pre-fetched from Qdrant for BM25-only hits).
        top_k: Number of fused results to return.
        k: RRF constant (default 60).

    Returns:
        List of payload dicts (up to top_k), each with an added '_id' key.
    """
    vector_ids = [str(h.id) for h in vector_hits]
    # Seed payload lookup from vector results; BM25-only hits come from fetched_payloads.
    payload_by_id: dict[str, dict] = {str(h.id): (h.payload or {}) for h in vector_hits}
    payload_by_id.update({pid: p for pid, p in fetched_payloads.items() if pid not in payload_by_id})

    merged = rrf([vector_ids, bm25_ids], k=k)
    fused_ids = list(merged)[:top_k]

    result = []
    for doc_id in fused_ids:
        payload = payload_by_id.get(doc_id, {})
        result.append({**payload, "_id": doc_id})
    return result
