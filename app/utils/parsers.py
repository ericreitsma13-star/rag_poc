from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.utils.config import SUPPORTED_EXTENSIONS


@dataclass(frozen=True)
class ParsedText:
    text: str
    metadata: dict



def _read_pdf(path: Path) -> list[ParsedText]:
    import fitz

    chunks: list[ParsedText] = []
    with fitz.open(path) as doc:
        for page_index, page in enumerate(doc):
            text = page.get_text("text").strip()
            if text:
                chunks.append(ParsedText(text=text, metadata={"page": page_index + 1}))
    return chunks



def _read_docx(path: Path) -> list[ParsedText]:
    import docx

    doc = docx.Document(path)
    text = "\n".join(p.text for p in doc.paragraphs if p.text.strip()).strip()
    return [ParsedText(text=text, metadata={})] if text else []



def _read_text(path: Path) -> list[ParsedText]:
    text = path.read_text(encoding="utf-8", errors="ignore").strip()
    return [ParsedText(text=text, metadata={})] if text else []



def parse_file(path: Path) -> list[ParsedText]:
    suffix = path.suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        return []

    if suffix == ".pdf":
        return _read_pdf(path)
    if suffix == ".docx":
        return _read_docx(path)
    return _read_text(path)
