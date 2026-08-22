"""Regression test: routers.ai must import `re` for memory-overview normalization.

A missing `import re` only surfaces at call time (NameError) when a user has at
least one memory, so guard the helper functions directly.
"""
from routers.ai import _looks_like_memory_noise, _normalize_memory_line


def test_normalize_memory_line_strips_scope_prefix():
    assert _normalize_memory_line("[profile] likes  coffee") == "likes coffee"
    assert _normalize_memory_line("[event_log] 2026-08-22: reviewed") == "2026-08-22: reviewed"
    assert _normalize_memory_line("no prefix here") == "no prefix here"
    assert _normalize_memory_line(None) == ""
    assert _normalize_memory_line("") == ""


def test_looks_like_memory_noise_runs_without_error():
    # Must not raise NameError; return type is bool for any string input.
    assert isinstance(_looks_like_memory_noise("likes coffee"), bool)
    assert isinstance(_looks_like_memory_noise(""), bool)
