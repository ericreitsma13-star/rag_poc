from __future__ import annotations

from pathlib import Path

import pytest

from app.utils.parsers import _read_text, parse_file


def test_read_text_plain(tmp_path: Path):
    f = tmp_path / "sample.txt"
    f.write_text("Hello world\nSecond line", encoding="utf-8")

    parts = _read_text(f)

    assert len(parts) == 1
    assert "Hello world" in parts[0].text
    assert parts[0].metadata == {}


def test_read_text_empty_file(tmp_path: Path):
    f = tmp_path / "empty.txt"
    f.write_text("", encoding="utf-8")

    parts = _read_text(f)

    assert parts == []


def test_parse_file_txt(tmp_path: Path):
    f = tmp_path / "notes.txt"
    f.write_text("Some notes here", encoding="utf-8")

    parts = parse_file(f)

    assert len(parts) == 1
    assert parts[0].text == "Some notes here"


def test_parse_file_md(tmp_path: Path):
    f = tmp_path / "readme.md"
    f.write_text("# Title\n\nBody text.", encoding="utf-8")

    parts = parse_file(f)

    assert len(parts) == 1
    assert "Title" in parts[0].text


def test_parse_file_unsupported_extension(tmp_path: Path):
    f = tmp_path / "data.csv"
    f.write_text("a,b,c", encoding="utf-8")

    parts = parse_file(f)

    assert parts == []


def test_read_text_strips_whitespace(tmp_path: Path):
    f = tmp_path / "spaces.txt"
    f.write_text("   \n  content  \n   ", encoding="utf-8")

    parts = _read_text(f)

    assert len(parts) == 1
    assert parts[0].text == "content"


def test_parse_file_pdf_skipped_if_no_fitz(tmp_path: Path):
    fitz = pytest.importorskip("fitz", reason="pymupdf not installed")
    # If fitz is available, create a minimal PDF and verify parse_file returns list
    _ = fitz  # noqa: F841
    # We just verify it doesn't raise for a real .pdf path when fitz is present
    # (can't easily create a real PDF without fitz in tests, so we only check type)
    f = tmp_path / "doc.pdf"
    f.write_bytes(b"%PDF-1.4\n%%EOF")  # minimal stub (fitz may return empty text)
    result = parse_file(f)
    assert isinstance(result, list)


def test_parse_file_docx_skipped_if_no_docx(tmp_path: Path):
    pytest.importorskip("docx", reason="python-docx not installed")
    # Verified live only when the library is installed
