from app.rag_query import build_messages, format_context



def test_format_context_contains_citations():
    context = format_context(
        [
            {"file_name": "a.md", "chunk_index": 2, "text": "foo", "citation": "[a.md#2]"},
            {"file_name": "b.md", "chunk_index": 1, "text": "bar", "citation": "[b.md#1]"},
        ]
    )

    assert "[a.md#2]" in context
    assert "foo" in context
    assert "[b.md#1]" in context



def test_build_messages_includes_context_and_question():
    messages = build_messages("What is this?", "[a.md#0]\nHello")
    assert messages[0]["role"] == "system"
    assert "context" in messages[0]["content"].lower()
    assert "What is this?" in messages[1]["content"]
    assert "[a.md#0]" in messages[1]["content"]
