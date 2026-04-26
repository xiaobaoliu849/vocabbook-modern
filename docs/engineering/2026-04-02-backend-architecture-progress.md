## 2026-04-02 Backend Architecture Progress

Scope continued from `2026-04-01-performance-optimization.md`:

1. Move synchronous SQLite hot paths behind repository or executor boundaries.
2. Replace chat-session JSON blob storage with append-oriented message storage.
3. Add request-level timing for p95 analysis.

### Implemented today

- Added repository boundaries:
  - `backend/repositories/chat_repository.py`
  - `backend/repositories/review_repository.py`
  - `backend/repositories/dictionary_repository.py`
- Added request timing infrastructure:
  - `backend/services/request_metrics.py`
  - middleware in `backend/main.py`
  - `/api/stats/request-timings`
- Added blocking execution helpers:
  - `backend/services/blocking_io.py`
- Reworked chat persistence in `backend/models/database.py`:
  - new `chat_messages` table
  - `chat_sessions.message_count`
  - legacy blob migration into row-based message storage
  - append-only save path when history prefix matches
  - rewrite path when history diverges
- Moved multiple router DB/IO paths behind async boundaries:
  - `backend/routers/ai.py`
  - `backend/routers/review.py`
  - `backend/routers/dictionary.py`
  - `backend/routers/stats.py`
  - `backend/routers/words.py`
  - `backend/routers/import_words.py`
  - `backend/services/limit_service.py`
- Added tests:
  - `backend/tests/test_chat_session_storage.py`
  - `backend/tests/test_request_metrics.py`

### Verified

- `py_compile` passes for all modified backend modules.
- `backend/tests/test_chat_session_storage.py` passes.
- `backend/tests/test_request_metrics.py` passes.

### Current blocker

The remaining blocker is the DB executor boundary on async review flows.

Observed behavior:

- Synchronous `ThreadPoolExecutor.submit(...).result()` works against repository DB methods.
- Pure async route-style awaits such as `await run_db_blocking(repo.get_word, "alpha")` can stall when the event loop has no other timer/IO wake-up.
- Adding a periodic `asyncio.sleep(...)` around the awaited future makes the same future complete, which strongly suggests an event-loop wake-up / executor-bridging issue instead of a SQLite query failure.

Minimal reproduction shape:

- Create `DatabaseManager`
- seed/update rows synchronously on main thread
- inside `asyncio.run(...)`, await executor-backed DB call
- await can stall even though the executor task itself appears to complete

This affects at least:

- `backend/tests/test_review_memory_enhancements.py::test_submit_review_returns_remaining_due_count`

### Important conclusion

The architectural direction is still correct:

- repository boundary: good
- append-oriented chat storage: good
- request timing middleware: good

But the executor handoff for SQLite-backed sync methods is not production-ready yet. Do not ship this state before the wake-up issue is resolved or the boundary strategy is revised.

### Highest-value next steps

1. Instrument `run_db_blocking()` with a deterministic completion path and confirm whether `loop.run_in_executor` / `asyncio.wrap_future` completion callbacks are being lost or delayed.
2. Compare alternative bridge strategies in the actual app context:
   - `loop.run_in_executor`
   - `asyncio.to_thread`
   - `starlette.concurrency.run_in_threadpool`
   - `anyio.to_thread.run_sync`
3. If the wake-up issue persists, replace the current executor approach with a dedicated async DB gateway pattern:
   - one long-lived worker thread
   - explicit request queue
   - results marshalled back via `loop.call_soon_threadsafe`
4. After the bridge is fixed, rerun:
   - `backend/tests/test_review_memory_enhancements.py`
   - `backend/tests/test_multi_dict_service.py`
   - broader backend suite

### Files touched today

- `backend/main.py`
- `backend/models/database.py`
- `backend/routers/ai.py`
- `backend/routers/dictionary.py`
- `backend/routers/import_words.py`
- `backend/routers/review.py`
- `backend/routers/stats.py`
- `backend/routers/words.py`
- `backend/services/blocking_io.py`
- `backend/services/limit_service.py`
- `backend/services/request_metrics.py`
- `backend/repositories/chat_repository.py`
- `backend/repositories/dictionary_repository.py`
- `backend/repositories/review_repository.py`
- `backend/tests/test_chat_session_storage.py`
- `backend/tests/test_request_metrics.py`
