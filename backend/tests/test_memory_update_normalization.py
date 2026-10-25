"""Tests for non-finite and out-of-range numbers in memory update responses.

A model can answer with a JSON number outside float range (``1e400`` parses to
``inf``) or with ``NaN``, and an unbounded integer such as ``10**400`` raises
``OverflowError`` in ``float()``. These optional fields are dropped or defaulted
per entry, as ``_normalize_memory_update_fact`` already does, instead of failing
the whole batch and losing the valid facts in the same response.
"""

import json
import logging

from deerflow.agents.memory.backends.deermem.deermem.core.updater import _coerce_source_confidence, _parse_memory_update_response

_VALID_FACT = {
    "content": "User prefers dark mode",
    "category": "preference",
    "confidence": 0.9,
    "scope": "user",
    "durability": "durable",
    "authority": "descriptive",
}


def _response(extra):
    return '{"user":{},"history":{},"newFacts":[' + json.dumps(_VALID_FACT) + "]," + extra + "}"


def test_infinite_extend_by_days_is_dropped():
    # 1e400 is outside float range, so json parses it to inf and int(inf) raises.
    parsed = _parse_memory_update_response(_response('"staleFactsToExtend":[{"id":"fact_1","extend_by_days":1e400}]'))

    assert len(parsed["newFacts"]) == 1
    assert parsed["staleFactsToExtend"] == []


def test_nan_extend_by_days_is_dropped():
    parsed = _parse_memory_update_response(_response('"staleFactsToExtend":[{"id":"fact_1","extend_by_days":NaN}]'))

    assert len(parsed["newFacts"]) == 1
    assert parsed["staleFactsToExtend"] == []


def test_unbounded_integer_extend_by_days_is_kept():
    # An integer literal beyond float range must survive as an int: the apply path
    # bounds it with min(days_since + extend_by, staleness_max_extension_days), which
    # works on arbitrary-precision ints but would raise OverflowError on int(float()).
    huge = "1" + "0" * 400
    parsed = _parse_memory_update_response(_response('"staleFactsToExtend":[{"id":"fact_1","extend_by_days":' + huge + "}]"))

    assert len(parsed["newFacts"]) == 1
    assert parsed["staleFactsToExtend"][0]["extend_by_days"] == 10**400


def test_unbounded_integer_consolidation_confidence_defaults(caplog):
    # float(10**400) raises OverflowError; the entry keeps its default confidence
    # and the default is logged so a systematically mis-scaled model stays visible.
    with caplog.at_level(logging.WARNING):
        parsed = _parse_memory_update_response(_response('"factsToConsolidate":[{"sourceIds":["fact_a","fact_b"],"consolidated":{"content":"Merged fact","category":"knowledge","confidence":' + "1" + "0" * 400 + "}}]"))

    assert len(parsed["newFacts"]) == 1
    assert parsed["factsToConsolidate"][0]["consolidated"]["confidence"] == 0.9
    assert "out-of-range confidence" in caplog.text


def test_finite_values_are_kept():
    parsed = _parse_memory_update_response(
        _response('"staleFactsToExtend":[{"id":"fact_1","extend_by_days":30}],"factsToConsolidate":[{"sourceIds":["fact_a","fact_b"],"consolidated":{"content":"Merged fact","category":"knowledge","confidence":0.7}}]')
    )

    assert parsed["staleFactsToExtend"][0]["extend_by_days"] == 30
    assert parsed["factsToConsolidate"][0]["consolidated"]["confidence"] == 0.7


def test_unbounded_integer_source_confidence_defaults_to_neutral():
    # _coerce_source_confidence reads confidences back from stored memory files,
    # and its docstring's threat model is corrupted or manually edited files.
    # JSON parses a 400-digit literal as an arbitrary-precision int, and
    # float() raises OverflowError (not ValueError) for it — the same shape
    # _normalize_memory_update_data already guards on the consolidation path.
    fact = {"content": "fact", "confidence": 10**400}

    assert _coerce_source_confidence(fact) == 0.5


def test_unbounded_integer_confidence_sorts_in_stale_extension_flow():
    # The stale-extension ranking sorts stored facts by this coercion; one
    # malformed fact must not crash the whole stale-facts pass.
    facts = [
        {"content": "bad", "confidence": 10**400},
        {"content": "good", "confidence": 0.9},
    ]

    ranked = sorted(facts, key=_coerce_source_confidence)

    assert [fact["content"] for fact in ranked] == ["bad", "good"]
