from __future__ import annotations

import ast
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Keywords that signal a calculation query (Dutch + English)
_CALC_KEYWORDS: frozenset[str] = frozenset(
    {
        "sum", "total", "average", "gemiddelde", "totaal", "count", "aantal",
        "max", "min", "highest", "lowest", "hoogste", "laagste",
        "group", "per", "mean", "median", "som", "maximum", "minimum",
    }
)

_ALLOWED_BUILTINS = {"len", "range", "sum", "min", "max", "round", "abs", "print"}

_CODE_GEN_PROMPT = """\
You are a pandas expert. Given the following DataFrame schema and sample:

Columns: {columns}
Dtypes:
{dtypes}
Sample (3 rows):
{sample}

Write a short Python snippet using only pandas and numpy to answer this question:
"{question}"

Rules:
- Do not import anything.
- Assign your final answer to a variable called `result`.
- `result` must be a scalar, list, or small DataFrame — not the full dataset.
- If the question cannot be answered from this data, set result = "Cannot answer: <reason>"
"""


def is_calculation_query(question: str) -> bool:
    """Return True if the question likely requires a pandas calculation."""
    tokens = set(question.lower().split())
    return bool(tokens & _CALC_KEYWORDS)


def _strip_fences(code: str) -> str:
    """Remove markdown code fences if present."""
    lines = code.strip().splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _safe_exec(code: str, df) -> str:
    """
    Execute generated pandas code in a restricted sandbox.

    Only pandas, numpy, and a small set of builtins are available.
    Import statements and access to os/sys/subprocess are blocked.
    The generated code must assign its answer to a variable named 'result'.
    """
    import numpy as np
    import pandas as pd

    tree = ast.parse(code)
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            raise ValueError("Imports are not allowed in generated code")
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
            if node.value.id in {"os", "sys", "subprocess", "shutil", "socket"}:
                raise ValueError(f"Access to '{node.value.id}' is not allowed")

    raw_builtins = __builtins__ if isinstance(__builtins__, dict) else vars(__builtins__)
    safe_builtins = {b: raw_builtins[b] for b in _ALLOWED_BUILTINS if b in raw_builtins}

    local_ns: dict = {"df": df, "pd": pd, "np": np}
    exec(compile(tree, "<generated>", "exec"), {"__builtins__": safe_builtins}, local_ns)  # noqa: S102
    return str(local_ns.get("result", "No variable named 'result' found in generated code"))


def _generate_code(question: str, df, client, model: str) -> str:
    """Ask the LLM to write a pandas snippet that answers the question."""
    prompt = _CODE_GEN_PROMPT.format(
        columns=list(df.columns),
        dtypes=df.dtypes.to_string(),
        sample=df.head(3).to_string(index=False),
        question=question,
    )
    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a pandas expert. Return only Python code, "
                    "no explanation, no markdown fences."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.0,
    )
    return _strip_fences(response.choices[0].message.content)


def run_df_agent(
    question: str,
    file_path: Path,
    client,
    model: str,
    max_rows: int = 50_000,
) -> dict:
    """
    Load an XLSX file, generate pandas code via LLM, execute it safely,
    and return a result dict with 'answer' and 'citations'.
    """
    import pandas as pd

    logger.info("df_agent: file=%s | question=%s", file_path.name, question)
    df = pd.read_excel(file_path, nrows=max_rows)
    if len(df) >= max_rows:
        logger.warning("DataFrame may be truncated at %d rows (max_rows limit)", max_rows)

    code = _generate_code(question, df, client, model)
    logger.debug("Generated code:\n%s", code)

    try:
        result_str = _safe_exec(code, df)
    except Exception as exc:
        logger.error("df_agent execution error: %s", exc)
        result_str = f"Fout bij uitvoering gegenereerde code: {exc}"

    label = f"{file_path.name}#df"
    return {
        "answer": f"{result_str}\n\n[{label}]",
        "citations": [{"label": label, "file": file_path.name, "chunk": "df"}],
    }
