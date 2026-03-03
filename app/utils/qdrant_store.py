from __future__ import annotations

from hashlib import sha1


class QdrantStore:
    def __init__(self, url: str, collection: str):
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

    def search(self, query_vector: list[float], top_k: int) -> list:
        return self.client.search(
            collection_name=self.collection,
            query_vector=query_vector,
            limit=top_k,
            with_payload=True,
        )



def point_id(source_path: str, chunk_index: int) -> str:
    raw = f"{source_path}:{chunk_index}".encode("utf-8")
    return sha1(raw).hexdigest()
