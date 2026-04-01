# 2026-04-01 Performance Optimization Record

## Scope

This round focused on structural performance improvements with measurable impact instead of cosmetic cleanup.

## Changes

### 1. Page-level code splitting

- Converted top-level page imports in `frontend/src/App.tsx` to `React.lazy`.
- Added visited-page retention so previously opened pages stay mounted after first load.
- Added Vite `manualChunks` rules in `frontend/vite.config.ts` to split vendor code into stable buckets.

### 2. AI chat persistence write reduction

- Added `frontend/src/hooks/useChatSessionSync.ts`.
- Replaced immediate per-update chat session writes with queued, debounced sync.
- Forced flush on page hide, page unload, delete, and clear-all flows to preserve data correctness.
- Prevented stale queued writes from restoring deleted sessions.

### 3. Hook dependency cleanup

- Fixed remaining React hook dependency warnings across:
  - `frontend/src/components/DictionaryPopup.tsx`
  - `frontend/src/components/review/SessionSummary.tsx`
  - `frontend/src/context/AuthContext.tsx`
  - `frontend/src/pages/AddWord.tsx`
  - `frontend/src/pages/AdminPanel.tsx`
  - `frontend/src/pages/WordList.tsx`
  - `frontend/src/pages/settings/sections/AISection.tsx`

### 4. Test baseline cleanup

- Added `pytest.ini` with `asyncio_mode = auto`.
- Marked `tts_test.py` as a manual smoke test unless `RUN_TTS_SMOKE=1` is set.

## Validation

- `npm run lint`: passed with `0` warnings.
- `npm run build`: passed.
- `./test_backend.sh -q`: `36 passed, 1 skipped`.

## Measured bundle impact

### Before

- Main JS bundle: `754.35 kB`

### After

- Main app shell chunk: `133.33 kB`
- AI chat page chunk: `41.84 kB`
- Review page chunk: `33.51 kB`
- Settings page chunk: `44.52 kB`
- Word list page chunk: `17.94 kB`
- Vendor code split into dedicated chunks instead of one oversized payload

## Remaining high-value work

- Move synchronous SQLite-heavy backend paths behind a repository layer or threadpool boundary.
- Replace chat-session JSON blob storage with append-oriented message storage.
- Add request-level timing so chat, review, and dictionary flows can be benchmarked with p95 numbers.
