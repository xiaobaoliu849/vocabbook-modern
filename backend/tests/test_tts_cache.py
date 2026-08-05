import os
import time

from routers import tts


def _seed_files(directory, count, size=100):
    paths = []
    for i in range(count):
        path = os.path.join(directory, f"audio_{i:03d}.mp3")
        with open(path, "wb") as f:
            f.write(b"x" * size)
        # Stagger mtimes so oldest-first ordering is deterministic.
        os.utime(path, (time.time() - (count - i) * 10,) * 2)
        paths.append(path)
    return paths


def test_cache_eviction_keeps_within_file_limit(tmp_path, monkeypatch):
    monkeypatch.setattr(tts, "OUTPUT_DIR", str(tmp_path))
    monkeypatch.setattr(tts, "CACHE_MAX_FILES", 5)
    monkeypatch.setattr(tts, "CACHE_MAX_BYTES", 10**9)
    paths = _seed_files(str(tmp_path), 8)

    tts.enforce_cache_limits()

    remaining = set(os.listdir(tmp_path))
    assert len(remaining) == 5
    # The three oldest files must be evicted.
    for path in paths[:3]:
        assert os.path.basename(path) not in remaining


def test_cache_eviction_keeps_within_size_limit(tmp_path, monkeypatch):
    monkeypatch.setattr(tts, "OUTPUT_DIR", str(tmp_path))
    monkeypatch.setattr(tts, "CACHE_MAX_FILES", 100)
    monkeypatch.setattr(tts, "CACHE_MAX_BYTES", 300)
    _seed_files(str(tmp_path), 6, size=100)

    tts.enforce_cache_limits()

    remaining = list(tmp_path.glob("*.mp3"))
    assert len(remaining) == 3
    assert sum(p.stat().st_size for p in remaining) <= 300


def test_cache_eviction_noop_when_under_limits(tmp_path, monkeypatch):
    monkeypatch.setattr(tts, "OUTPUT_DIR", str(tmp_path))
    monkeypatch.setattr(tts, "CACHE_MAX_FILES", 10)
    monkeypatch.setattr(tts, "CACHE_MAX_BYTES", 10**9)
    _seed_files(str(tmp_path), 3)

    tts.enforce_cache_limits()

    assert len(list(tmp_path.glob("*.mp3"))) == 3


def test_cache_eviction_tolerates_missing_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(tts, "OUTPUT_DIR", str(tmp_path / "nonexistent"))

    tts.enforce_cache_limits()  # must not raise
