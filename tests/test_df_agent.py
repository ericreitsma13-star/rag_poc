from __future__ import annotations

import pytest

pd = pytest.importorskip("pandas", reason="pandas not installed")

from app.utils.df_agent import _safe_exec, _strip_fences, is_calculation_query


# ── _safe_exec ────────────────────────────────────────────────────────────────

def test_safe_exec_sum():
    df = pd.DataFrame({"value": [10, 20, 30]})
    assert _safe_exec("result = df['value'].sum()", df) == "60"


def test_safe_exec_mean():
    df = pd.DataFrame({"price": [100.0, 200.0, 300.0]})
    result = _safe_exec("result = df['price'].mean()", df)
    assert result == "200.0"


def test_safe_exec_blocks_import():
    df = pd.DataFrame({"x": [1]})
    with pytest.raises(ValueError, match="Imports"):
        _safe_exec("import os\nresult = os.getcwd()", df)


def test_safe_exec_blocks_os_access():
    df = pd.DataFrame({"x": [1]})
    with pytest.raises(ValueError, match="'os'"):
        _safe_exec("result = os.listdir('/')", df)


def test_safe_exec_no_result_var():
    df = pd.DataFrame({"x": [1]})
    result = _safe_exec("x = 42", df)
    assert "result" in result.lower()


def test_safe_exec_small_dataframe_result():
    df = pd.DataFrame({"name": ["Alice", "Bob"], "score": [90, 85]})
    result = _safe_exec("result = df[df['score'] > 87][['name']]", df)
    assert "Alice" in result


# ── _strip_fences ─────────────────────────────────────────────────────────────

def test_strip_fences_python_block():
    code = "```python\nresult = 1 + 1\n```"
    assert _strip_fences(code) == "result = 1 + 1"


def test_strip_fences_plain_block():
    code = "```\nresult = df.sum()\n```"
    assert _strip_fences(code) == "result = df.sum()"


def test_strip_fences_no_fences():
    code = "result = df['col'].max()"
    assert _strip_fences(code) == code


# ── is_calculation_query ──────────────────────────────────────────────────────

def test_calc_query_dutch_keywords():
    assert is_calculation_query("Wat is het gemiddelde van alle facturen?")
    assert is_calculation_query("Bereken het totaal per leverancier")
    assert is_calculation_query("Hoeveel records zijn er (aantal)?")


def test_calc_query_english_keywords():
    assert is_calculation_query("What is the average invoice value?")
    assert is_calculation_query("Show the maximum amount")
    assert is_calculation_query("Count the number of suppliers")
    assert is_calculation_query("What is the total revenue?")


def test_calc_query_false_for_lookup():
    assert not is_calculation_query("Wat staat er in rij 14?")
    assert not is_calculation_query("Tell me about supplier X")
    assert not is_calculation_query("Show me the contract details")
