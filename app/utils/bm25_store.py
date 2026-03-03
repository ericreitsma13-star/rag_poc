from __future__ import annotations

import logging
import pickle
from pathlib import Path

logger = logging.getLogger(__name__)


class BM25Store:
    """
    Persistent BM25 index keyed by Qdrant point IDs.

    Stores a mapping of source_path → set of point IDs so that when a file is
    re-indexed, its old chunks can be removed efficiently before adding new ones.
    """

    def __init__(self, index_path: Path | str) -> None:
        self.index_path = Path(index_path)
        self._texts: list[str] = []
        self._ids: list[str] = []
        # source_path (str) → set of point IDs belonging to that file
        self._source_ids: dict[str, set[str]] = {}
        self._bm25 = None

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        return text.lower().split()

    def _rebuild(self) -> None:
        if not self._texts:
            self._bm25 = None
            return
        from rank_bm25 import BM25Okapi

        self._bm25 = BM25Okapi([self._tokenize(t) for t in self._texts])

    def replace_document(self, source_path: str, texts: list[str], ids: list[str]) -> None:
        """Remove existing entries for source_path, then add the new chunks."""
        old_ids = self._source_ids.pop(source_path, set())
        if old_ids:
            paired = [(t, i) for t, i in zip(self._texts, self._ids) if i not in old_ids]
            if paired:
                self._texts, self._ids = map(list, zip(*paired))
            else:
                self._texts, self._ids = [], []

        self._texts.extend(texts)
        self._ids.extend(ids)
        self._source_ids[source_path] = set(ids)
        self._rebuild()
        logger.debug(
            "BM25: added %d chunks for %s (total %d)", len(texts), source_path, len(self._texts)
        )

    def search(self, query: str, top_k: int) -> list[str]:
        """Return point IDs ranked by BM25 score (best first)."""
        if self._bm25 is None or not self._ids:
            return []
        tokens = self._tokenize(query)
        scores = self._bm25.get_scores(tokens)
        ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
        return [self._ids[i] for i in ranked[:top_k]]

    def save(self) -> None:
        self.index_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.index_path, "wb") as f:
            pickle.dump(
                {"texts": self._texts, "ids": self._ids, "source_ids": self._source_ids}, f
            )
        logger.debug("BM25 saved to %s (%d chunks)", self.index_path, len(self._texts))

    def load(self) -> bool:
        """Load from disk; returns True if successful."""
        if not self.index_path.exists():
            return False
        try:
            with open(self.index_path, "rb") as f:
                data = pickle.load(f)
            self._texts = data["texts"]
            self._ids = data["ids"]
            self._source_ids = data.get("source_ids", {})
            self._rebuild()
            logger.debug(
                "BM25 loaded from %s (%d chunks)", self.index_path, len(self._texts)
            )
            return True
        except Exception as exc:
            logger.warning("Failed to load BM25 index: %s — starting fresh", exc)
            return False

    @property
    def chunk_count(self) -> int:
        return len(self._texts)
