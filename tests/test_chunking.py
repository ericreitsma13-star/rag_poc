from app.utils.chunking import chunk_text



def test_chunking_with_overlap():
    text = "a" * 100
    chunks = chunk_text(text, chunk_chars=40, overlap=10)

    assert len(chunks) == 3
    assert chunks[0].text == "a" * 40
    assert chunks[1].text == "a" * 40
    assert chunks[2].text == "a" * 40
    assert chunks[0].chunk_index == 0
    assert chunks[2].chunk_index == 2



def test_chunking_validation():
    try:
        chunk_text("hello", chunk_chars=10, overlap=10)
    except ValueError as exc:
        assert "overlap" in str(exc)
    else:
        raise AssertionError("Expected ValueError")
