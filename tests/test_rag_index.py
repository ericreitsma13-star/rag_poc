from pathlib import Path

from app.rag_index import build_points



def test_build_points_creates_expected_payload(tmp_path: Path):
    source = tmp_path / "doc.txt"
    source.write_text("x", encoding="utf-8")

    points = build_points(source, ["chunk one", "chunk two"], [[0.1, 0.2], [0.3, 0.4]])

    assert len(points) == 2
    assert points[0]["payload"]["file_name"] == "doc.txt"
    assert points[0]["payload"]["chunk_index"] == 0
    assert points[0]["payload"]["citation"] == "[doc.txt#0]"
