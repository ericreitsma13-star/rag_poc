from __future__ import annotations

import json
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path


STATE_FILE = Path(".rag_index_state.json")


@dataclass(frozen=True)
class FileState:
    source_path: str
    size: int
    mtime_ns: int
    content_hash: str



def fingerprint(path: Path) -> FileState:
    stat = path.stat()
    content = path.read_bytes()
    return FileState(
        source_path=str(path.resolve()),
        size=stat.st_size,
        mtime_ns=stat.st_mtime_ns,
        content_hash=sha256(content).hexdigest(),
    )



def load_state() -> dict[str, dict]:
    if not STATE_FILE.exists():
        return {}
    return json.loads(STATE_FILE.read_text(encoding="utf-8"))



def save_state(state: dict[str, dict]) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")



def is_changed(path: Path, state: dict[str, dict]) -> bool:
    current = fingerprint(path)
    previous = state.get(current.source_path)
    if not previous:
        return True

    return any(
        [
            previous.get("size") != current.size,
            previous.get("mtime_ns") != current.mtime_ns,
            previous.get("content_hash") != current.content_hash,
        ]
    )
