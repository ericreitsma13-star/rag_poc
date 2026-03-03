from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


class CrossEncoderReranker:
    """Thin wrapper around sentence-transformers CrossEncoder for candidate reranking."""

    def __init__(self, model_name: str) -> None:
        from sentence_transformers import CrossEncoder

        logger.info("Loading cross-encoder: %s", model_name)
        self._model = CrossEncoder(model_name)

    def rerank(self, query: str, candidates: list[dict], top_k: int) -> list[dict]:
        """
        Score each candidate against the query and return the top_k results.

        Candidates must have a 'text' key.  Returns a new list sorted by
        descending relevance score.
        """
        if not candidates:
            return []
        pairs = [(query, c.get("text", "")) for c in candidates]
        scores = self._model.predict(pairs)
        ranked = sorted(zip(candidates, scores), key=lambda x: x[1], reverse=True)
        logger.debug(
            "Reranker top-%d: %s",
            top_k,
            [(c.get("file_name", "?"), f"{s:.3f}") for c, s in ranked[:top_k]],
        )
        return [c for c, _ in ranked[:top_k]]
