from __future__ import annotations

import uuid


class QdrantStore:
    def __init__(self, url: str, collection: str) -> None:
        from qdrant_client import QdrantClient

        self.client = QdrantClient(url=url)
        self.collection = collection

    def ensure_collection(self, vector_size: int) -> None:
        from qdrant_client.http import models

        collections = self.client.get_collections().collections
        names = {c.name for c in collections}
        if self.collection in names:
            return

        self.client.create_collection(
            collection_name=self.collection,
            vectors_config=models.VectorParams(size=vector_size, distance=models.Distance.COSINE),
        )

    def replace_document(self, source_path: str) -> None:
        from qdrant_client.http import models

        self.client.delete(
            collection_name=self.collection,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="source_path",
                            match=models.MatchValue(value=source_path),
                        )
                    ]
                )
            ),
            wait=True,
        )

    def upsert_points(self, points: list[dict]) -> None:
        from qdrant_client.http import models

        if not points:
            return
        qdrant_points = [
            models.PointStruct(id=point["id"], vector=point["vector"], payload=point["payload"])
            for point in points
        ]
        self.client.upsert(collection_name=self.collection, points=qdrant_points, wait=True)

    def search(self, query_vector: list[float], top_k: int, query_filter=None) -> list:
        """
        Search by vector similarity.

        Args:
            query_vector: Dense embedding of the query.
            top_k: Number of results to return.
            query_filter: Optional qdrant_client Filter object for metadata filtering.
        """
        return self.client.search(
            collection_name=self.collection,
            query_vector=query_vector,
            limit=top_k,
            with_payload=True,
            query_filter=query_filter,
        )

    def fetch_by_ids(self, ids: list[str]) -> list:
        """
        Retrieve points by ID.  Returns a list of qdrant_client Record objects.
        Used to fetch payloads for BM25-only hits not returned by vector search.
        """
        if not ids:
            return []
        return self.client.retrieve(
            collection_name=self.collection,
            ids=ids,
            with_payload=True,
        )


def point_id(source_path: str, chunk_index: int) -> str:
    name = f"{source_path}:{chunk_index}"
    return str(uuid.uuid5(uuid.NAMESPACE_URL, name))
