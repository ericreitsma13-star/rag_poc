from __future__ import annotations

import argparse
import json
import logging

import requests

from app.utils.config import load_settings
from app.utils.qdrant_store import QdrantStore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("rag_query")


def format_context(results: list[dict]) -> str:
    blocks: list[str] = []
    for item in results:
        citation = item.get("citation", f"[{item.get('file_name', 'unknown')}#{item.get('chunk_index', '?')}]")
        text = item.get("text", "")
        blocks.append(f"{citation}\n{text}")
    return "\n\n".join(blocks)


def extract_citations(results: list[dict]) -> list[dict]:
    citations = []
    for item in results:
        file_name = item.get("file_name", "unknown")
        chunk_index = item.get("chunk_index", "?")
        label = item.get("citation", f"{file_name}#{chunk_index}")
        # Strip surrounding brackets if present
        label = label.strip("[]")
        citations.append({"label": label, "file": file_name, "chunk": chunk_index})
    return citations


def build_messages(question: str, context: str) -> list[dict[str, str]]:
    system = (
        "Je bent een nauwkeurige RAG-assistent. Bij het formuleren van je antwoord moet je de volgende regels strikt hanteren:\n\n"
        "1. **Linguïstische Consistentie:** Controleer bij persoonsnamen en familierelaties of het geslacht logisch consistent is. "
        "Voorbeeld: Als de brontekst spreekt over 'Sarah' en 'aunt', gebruik dan 'tante' en 'vrouwelijk'. "
        "Voorkom gender-bias: Ga er niet vanuit dat technische rollen (zoals engineering) mannelijk zijn.\n\n"
        "2. **Feitelijke Isolatie:** Beantwoord de vraag UITSLUITEND op basis van de meegeleverde context. Verzin NIETS. Gebruik GEEN voorkennis of trainingsdata. "
        "Vermeng informatie uit verschillende bronnen NIET als de vraag over één specifieke entiteit gaat — "
        "controleer altijd of de geciteerde chunk daadwerkelijk over die entiteit gaat. "
        "Als een specifiek feit niet in de context staat, vermeld dit dan expliciet.\n\n"
        "3. **Terminologie-Check:** Vertaal Engelse termen nauwkeurig naar het Nederlands. Bij twijfel over een relatie (zoals 'aunt'), hanteer de letterlijke vertaling.\n\n"
        "4. **Bronvermelding:** Markeer chunks altijd met hun ID in de vorm [bestandsnaam#chunk_index], "
        "en gebruik een citatie alleen als de betreffende chunk de bewering daadwerkelijk ondersteunt.\n\n"
        "Antwoord in het Nederlands standaard, maar antwoord in het Engels als de vraag duidelijk Engels is."
    )
    user = f"Vraag:\n{question}\n\nContext:\n{context}"
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def ask_llm(llm_url: str, model: str, messages: list[dict[str, str]]) -> str:
    """Call any OpenAI-compatible /v1/chat/completions endpoint (LM Studio, Ollama, etc.)."""
    endpoint = f"{llm_url.rstrip('/')}/v1/chat/completions"
    response = requests.post(
        endpoint,
        json={"model": model, "messages": messages, "stream": False},
        timeout=600,
    )
    response.raise_for_status()
    payload = response.json()
    return payload["choices"][0]["message"]["content"]


def build_qdrant_filter(filetype: str | None, file: str | None, since: str | None, tag: str | None):
    """Build a Qdrant filter dict from CLI filter args. Returns None if no filters active."""
    from qdrant_client.models import Filter, FieldCondition, MatchValue, Range
    import datetime

    conditions = []

    if filetype:
        conditions.append(FieldCondition(key="file_type", match=MatchValue(value=filetype)))
    if file:
        conditions.append(FieldCondition(key="file_name", match=MatchValue(value=file)))
    if tag:
        conditions.append(FieldCondition(key="tag", match=MatchValue(value=tag)))
    if since:
        conditions.append(FieldCondition(key="indexed_at", range=Range(gte=since)))

    return Filter(must=conditions) if conditions else None


def run_query(
    question: str,
    top_k: int | None = None,
    filetype: str | None = None,
    file: str | None = None,
    since: str | None = None,
    tag: str | None = None,
) -> dict:
    """Returns dict with keys: answer, citations."""
    settings = load_settings()
    top = top_k or settings.rag_top_k

    from app.utils.embeddings import LocalEmbedder

    embedder = LocalEmbedder(settings.rag_embed_model)
    store = QdrantStore(settings.qdrant_url, settings.qdrant_collection)

    query_vector = embedder.embed_query(question)

    qdrant_filter = build_qdrant_filter(filetype, file, since, tag)
    hits = store.search(query_vector=query_vector, top_k=top, query_filter=qdrant_filter)

    payloads = [hit.payload or {} for hit in hits]
    context = format_context(payloads)

    if not context.strip():
        return {
            "answer": "Ik weet het niet op basis van de huidige index. Voeg relevante documenten toe en indexeer opnieuw.",
            "citations": [],
        }

    messages = build_messages(question, context)
    answer = ask_llm(settings.lmstudio_url, settings.lmstudio_model, messages)

    return {
        "answer": answer.strip(),
        "citations": extract_citations(payloads),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Ask questions against the local RAG index")
    parser.add_argument("question", nargs="?", help="Question to ask")
    parser.add_argument("--top-k",    type=int, default=None, help="Override retrieval top-k")
    parser.add_argument("--filetype", default=None, help="Filter by file type (pdf, docx, xlsx, md, txt)")
    parser.add_argument("--file",     default=None, help="Filter by exact file name")
    parser.add_argument("--since",    default=None, help="Filter by indexed_at >= YYYY-MM-DD")
    parser.add_argument("--tag",      default=None, help="Filter by tag")
    args = parser.parse_args()

    if args.question:
        # Non-interactive mode: print JSON for the frontend
        try:
            result = run_query(
                args.question,
                top_k=args.top_k,
                filetype=args.filetype,
                file=args.file,
                since=args.since,
                tag=args.tag,
            )
            print(json.dumps(result, ensure_ascii=False))
        except Exception as exc:
            logger.exception("Query failed: %s", exc)
            print(json.dumps({"answer": f"Error: {exc}", "citations": []}))
        return 0

    # Interactive mode
    while True:
        try:
            question = input("Vraag> ").strip()
        except EOFError:
            print()
            break

        if not question or question.lower() in {"exit", "quit"}:
            break

        try:
            result = run_query(question, top_k=args.top_k)
            print(result["answer"])
            if result["citations"]:
                print("\nBronnen:", ", ".join(f"[{c['label']}]" for c in result["citations"]))
        except Exception as exc:
            logger.exception("Query failed: %s", exc)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
