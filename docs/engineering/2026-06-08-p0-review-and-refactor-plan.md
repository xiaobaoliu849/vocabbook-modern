# P0 Code Review & Refactor Plan — 2026-06-08

Comprehensive review done 2026-06-08. Three P0 items already shipped; the rest
are captured here so the next session can pick them up without re-scanning.

## ✅ Done (commits on `main`)

| Commit | Item | Description |
|---|---|---|
| `b0bebc5` | chore(deps) | `backend/requirements-dev.txt`: `everos>=0.4.0` → `everos-cloud>=0.4.0` (Cloud SDK was renamed on PyPI when the OSS variant took the `everos` name). |
| `2d1c5e7` | P0-1 | Extracted `RecallEngine` (866 lines) out of `services/ai_service.py` (1765 → 1154). 30 stateless recall / classification / scoring helpers + ~250 lines of pattern constants. `AIService` keeps thin forwarding wrappers so existing callers still work. |
| `65191d5` | P0-3 | 80 production `print()` calls → `logger.<level>()` across 10 files. Added `import logging` + per-module `logger = logging.getLogger(__name__)`. Test / diagnostic scripts left as `print()` on purpose. |

All three verified by `pytest` (44 passed / 13 skipped, unchanged) + uvicorn boot + endpoint smoke.

## 🔲 Not started

### P0-2 — Split `backend/models/database.py` God-module

1463 lines. Currently mixes schema DDL, migrations, and CRUD for every table
(`words`, `review_history`, `word_families`, `study_stats`, `dict_cache`,
`translations`, `chat_sessions`, `chat_messages`, `user_limits`).

**Proposed split:**
- `models/schema.py` — CREATE TABLE + CREATE INDEX statements, version marker
- `models/migrations.py` — `check_schema_updates`, `migrate_from_json`, legacy migrations
- `models/words_repo.py` — `add_word`, `get_word`, `get_all_words`, `get_words_for_list`, `update_word`, `update_context`, `get_all_tags`
- `models/reviews_repo.py` — `log_study_session`, review-history queries
- `models/chat_repo.py` — `chat_sessions` + `chat_messages` (already uses a separate schema helper `_ensure_chat_message_schema`)
- `models/cache_repo.py` — `dict_cache`, `translations`

Then `DatabaseManager` becomes a thin dispatcher that owns the SQLite
connection and exposes `self.words`, `self.reviews`, `self.chat`, `self.cache`
repository instances.

**Risk:** many routers `from models.database import DatabaseManager` and call
methods directly. Plan the cut-over behind a `DatabaseManager` façade that
delegates to repos so callers can migrate one at a time.

### P0-4 — Add owner-token auth to the API

Right now there is **no authentication on any endpoint** and CORS is fully
open to localhost (`main.py:59-65`). On a LAN, anyone who can reach
`localhost:8000` can read/write the word list, hit the AI endpoint (which
would then call OpenAI on the configured key), and pull EverMem memories.

**Proposed minimal fix:**
1. Add `OWNER_TOKEN` env var (generated once via `python -c "import secrets; print(secrets.token_urlsafe(32))"`).
2. A single FastAPI `Depends` guard `require_owner` that reads `Authorization: Bearer <token>` or `X-Owner-Token` and raises 401 if it doesn't match.
3. Apply `Depends(require_owner)` to all routers except `GET /`, `GET /health`, `GET /docs`.
4. Frontend stores the token in `localStorage` once (Settings → Owner Token input) and attaches it on every request via the existing `api.ts` interceptor.

**Not a full multi-user auth system** — this is single-owner personal-app auth.
Deliberately no registration, no password hashing, no JWT rotation.

### P0-5 — Move API keys from frontend headers to backend env

The frontend currently stores API keys in `localStorage` and re-sends them on
**every request** as `X-AI-Key` / `X-EverMem-Key`. Anyone sniffing the LAN
traffic sees the keys in cleartext.

**Plan (already discussed with user, ready to execute):**

Phase 1 — Backend (env-first, header as fallback):
1. Add `backend/.env` + `backend/.env.example`:
   ```
   OPENAI_API_KEY=
   ANTHROPIC_API_KEY=
   GEMINI_API_KEY=
   DASHSCOPE_API_KEY=
   AI_PROVIDER=openai
   AI_MODEL=gpt-4o-mini
   AI_API_BASE=
   EVERMEM_ENABLED=true
   EVERMEM_URL=https://api.evermind.ai
   EVERMEM_API_KEY=
   EVERMEM_USER_ID=guest
   ```
2. Install `python-dotenv`; `main.py` calls `load_dotenv()` on startup.
3. Update `routers/ai.py`, `routers/review.py`, `routers/attachments.py`:
   - Stop requiring `X-AI-Key` / `X-EverMem-Key`; prefer env.
   - Keep `X-AI-Provider`, `X-AI-Model`, `X-AI-Base`, `X-EverMem-Enabled`,
     `X-EverMem-Url` (non-secret UI preferences).
   - If frontend omits provider/model, fall back to env defaults.
4. `AIService.__init__` already has env fallback for the key — verify it
   works when `api_key=None` is passed.
5. Add read-only `GET /api/ai/config` returning `{provider, model,
   evermem_enabled}` (NEVER the key) so the settings UI can show status.

Phase 2 — Frontend:
1. Remove all `X-AI-Key` / `X-EverMem-Key` header injection from
   `AIChat.tsx`, `DictionaryPopup.tsx`, `QuickLookupPopup.tsx`,
   `TranslationPage.tsx`, `AISection.tsx`.
2. Settings UI: replace API key inputs with a read-only status line
   ("Backend env configured" / "Not configured") — or hide entirely.
3. Drop `ai_api_key` and the `apiKeys` map from `localStorage`; keep
   `aiProvider` / `aiModel`.

Phase 3 — Cleanup:
1. Update `tests/test_review_memory_enhancements.py`: replace
   `x_evermem_key="secret-key"` with env-var setup (`monkeypatch.setenv`).
2. Audit `backend/config.py` for leftover hardcoded defaults.

**Trade-off:** all users of the backend share one set of keys. Acceptable for
a personal learning app; multi-user key isolation is out of scope.

## 🟡 Smaller cleanup (no priority yet)

- `diag_words.py` — root-level untracked one-shot SQLite diagnostic script
  (63 lines, created 2026-06-07 19:05). Either delete, or move to
  `scripts/diag/` and add to `.gitignore`.
- `patch.diff`, `update_ai_section.py`, `_slim_ai.py`, `_print_to_logger.py`
  (any that still exist) — one-shot refactor scripts; delete.
- `frontend/src/pages/AIChat.tsx` is 2026 lines; split into
  `ChatHeader` / `MessageList` / `Composer` / `ModelSelector` / `RecallPanel`.
- `frontend/src/pages/Review.tsx` (809), `AddWord.tsx` (543),
  `WordList.tsx` (533) — same treatment.
- 24 `as any` casts in `frontend/src/**` — type the API response shapes.
- 74 `useEffect(() => {...})` with no dependency array — audit & add deps.
- Frontend API base fallback (`VITE_API_URL || 'http://localhost:8000'`) is
  duplicated across 5+ files — centralize in `utils/api.ts`.
- `backend/routers/tts.py` / `import_words.py` — add type hints, remove any
  remaining `print()` (all already migrated in `65191d5`, just confirm).
- Chinese + English docstrings are mixed across the backend — pick one.
- `backend/test_evermem.py` (root of `backend/`) should live under
  `backend/tests/` with the other test files.

## 📝 Push status (as of 2026-06-08 end of session)

`main` is 3 commits ahead of `origin/main` (b0bebc5, 2d1c5e7, 65191d5).
Push is blocked by HTTPS credential prompt — `gh` CLI is not installed in
this environment, but `~/.ssh/id_rsa` exists. Fix with:

```
git remote set-url origin git@github.com:xiaobaoliu849/vocabbook-modern.git
git push origin main
```

…then fetch/pull/push will go over SSH going forward.
