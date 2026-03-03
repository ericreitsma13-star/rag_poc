from __future__ import annotations

import argparse
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



def build_messages(question: str, context: str) -> list[dict[str, str]]:
    system = (
        "Je bent een RAG-assistent. Beantwoord de vraag UITSLUITEND op basis van de onderstaande context. "
        "Verzin NIETS. Gebruik GEEN voorkennis of trainingsdata. "
        "Als een specifiek feit niet letterlijk of duidelijk afleidbaar is uit de context, zeg dan expliciet dat die informatie ontbreekt. "
        "Vermeng informatie uit verschillende bronnen NIET als de vraag over één specifieke entiteit gaat — "
        "controleer altijd of de geciteerde chunk daadwerkelijk over die entiteit gaat. "
        "Gebruik citaties in de vorm [bestandsnaam#chunk_index] alleen voor chunks die de bewering daadwerkelijk ondersteunen. "
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



def run_query(question: str, top_k: int | None = None) -> str:
    settings = load_settings()
    top = top_k or settings.rag_top_k

    from app.utils.embeddings import LocalEmbedder

    embedder = LocalEmbedder(settings.rag_embed_model)
    store = QdrantStore(settings.qdrant_url, settings.qdrant_collection)

    query_vector = embedder.embed_query(question)
    hits = store.search(query_vector=query_vector, top_k=top)

    payloads = [hit.payload or {} for hit in hits]
    context = format_context(payloads)
    if not context.strip():
        return "Ik weet het niet op basis van de huidige index. Voeg relevante documenten toe en indexeer opnieuw."

    messages = build_messages(question, context)
    answer = ask_llm(settings.ollama_url, settings.ollama_model, messages)
    return answer.strip()



def main() -> int:
    parser = argparse.ArgumentParser(description="Ask questions against the local RAG index")
    parser.add_argument("question", nargs="?", help="Question to ask")
    parser.add_argument("--top-k", type=int, default=None, help="Override retrieval top-k")
    args = parser.parse_args()

    if args.question:
        print(run_query(args.question, top_k=args.top_k))
        return 0

    while True:
        try:
            question = input("Vraag> ").strip()
        except EOFError:
            print()
            break

        if not question or question.lower() in {"exit", "quit"}:
            break

        try:
            print(run_query(question, top_k=args.top_k))
        except Exception as exc:  # noqa: BLE001
            logger.exception("Query failed: %s", exc)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
