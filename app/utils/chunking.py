from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TextChunk:
    text: str
    chunk_index: int



def chunk_text(text: str, chunk_chars: int, overlap: int) -> list[TextChunk]:
    if chunk_chars <= 0:
        raise ValueError("chunk_chars must be > 0")
    if overlap < 0:
        raise ValueError("overlap must be >= 0")
    if overlap >= chunk_chars:
        raise ValueError("overlap must be smaller than chunk_chars")

    normalized = text.strip()
    if not normalized:
        return []

    chunks: list[TextChunk] = []
    start = 0
    chunk_index = 0

    while start < len(normalized):
        end = min(start + chunk_chars, len(normalized))
        chunk_body = normalized[start:end].strip()
        if chunk_body:
            chunks.append(TextChunk(text=chunk_body, chunk_index=chunk_index))
            chunk_index += 1

        if end == len(normalized):
            break
        start = end - overlap

    return chunks
