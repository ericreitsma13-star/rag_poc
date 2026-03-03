from __future__ import annotations

from sentence_transformers import SentenceTransformer


class LocalEmbedder:
    def __init__(self, model_name: str):
        self._model = SentenceTransformer(model_name)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        prefixed = [f"passage: {t}" for t in texts]
        vectors = self._model.encode(prefixed, normalize_embeddings=True)
        return vectors.tolist()

    def embed_query(self, text: str) -> list[float]:
        vector = self._model.encode([f"query: {text}"], normalize_embeddings=True)
        return vector[0].tolist()
