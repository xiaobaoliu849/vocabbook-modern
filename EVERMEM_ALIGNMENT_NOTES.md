# EverMem Recall Alignment Notes

This document captures the main pitfalls we hit while integrating EverMem long-term memory recall into the chat flow, and the concrete alignments required to make recall work reliably.

## Official API References

- Introduction: `https://docs.evermind.ai/api-reference/introduction`
- Add memories: `https://docs.evermind.ai/api-reference/core-memory-operation/add-memories`
- Search memories: `https://docs.evermind.ai/api-reference/core-memory-operation/search-memories`
- Get memories: `https://docs.evermind.ai/api-reference/core-memory-operation/get-memories`
- Delete memories: `https://docs.evermind.ai/api-reference/core-memory-operation/delete-memories`
- Memory types: `https://docs.evermind.ai/api-reference/memory-types`

## What Finally Worked

The recall path only became reliable after aligning to the official API model:

1. Write chat turns with `group_id=session_id`.
2. Send the current `session_id` from the frontend on every chat request.
3. Finalize each turn with `flush=true` after the assistant finishes responding.
4. Use `search memories` for `episodic_memory`.
5. Use `get memories` for `event_log`.
6. Parse the real cloud response fields instead of guessing them.
7. Filter out assistant-generated facts and question-shaped facts before injecting recall context.

## Main Pitfalls

### 1. `session_id` was not sent from the frontend

If the frontend does not send `session_id`, the backend can only search with `group_ids=None`, which mixes all historical groups and makes recall noisy or irrelevant.

Fix:
- `frontend/src/pages/AIChat.tsx`
- Always send:

```json
{
  "messages": [...],
  "session_id": "<activeSessionId>"
}
```

### 2. New turns were not being finalized into retrievable memory

Writing only the user turn was not enough. Without a final `flush=true`, new messages could remain pending and not become retrievable `event_log` / `episodic_memory`.

Fix:
- After the assistant finishes responding, add a memory with:
  - `role="assistant"`
  - `flush=true`
  - same `group_id=session_id`

Important:
- This does not mean "trust assistant answers as facts".
- It means "close the turn so EverMem extracts memory from the finished conversation".

### 3. `search memories` and `get memories` have different jobs

This was a major source of confusion.

- `search memories` is suitable for `episodic_memory` and profile-like semantic recall.
- `event_log` should come from `get memories`, not semantic search.

If this split is ignored, recall tends to drift toward summaries instead of exact facts.

### 4. Search score parsing was wrong

Cloud responses can place scores in `result.scores`, not only in `memory.score`.

Symptom:
- API logs showed `memories=8`
- local recall pipeline still treated everything as score `0`
- then filtered all candidates out

Fix:
- In `backend/services/evermem_service.py`, map score as:
  - `mem.score` if present
  - otherwise `result.scores[index]`

### 5. Event log content field was wrong

For `event_log`, the actual text was not in `content` or `summary`.

Real cloud field:
- `atomic_fact`

Symptom:
- API logs showed `event_log memories=80+`
- local parser still produced `user_event_logs=0`

Fix:
- Parse `atomic_fact` first, then fall back to `episode/summary/content/message`.

### 6. Assistant facts polluted recall

EverMem can generate atomic facts about assistant behavior too, for example:

- "The Assistant complimented the User..."
- "The assistant asked the User..."
- "The assistant stated..."

Those are valid records in the cloud system, but they are bad recall candidates for "What did I say?" style questions.

Fix:
- Filter out assistant facts by text pattern, not only by `role`, because raw event log items may not expose a reliable `role`.
- Discard facts starting with patterns like:
  - `The assistant ...`
  - `Assistant said ...`
  - `Assistant asked ...`
  - `Assistant provided ...`

### 7. Question-shaped user events also polluted recall

Facts like:

- "The user asked what two food things they had said they remembered."

are technically user events, but they are meta-questions, not the answer.

Fix:
- Filter out "question events" such as:
  - `The user asked ...`
  - `asked what ...`
  - `asked whether ...`
  - `asked if ...`

### 8. Generic follow-up questions need a fallback

Questions like:

- `What two food things did I say I remembered?`

do not themselves contain the keywords `suancai` or `ham sausage`.

Without a fallback, exact-term filtering can still drop relevant memories.

Fix:
- If exact-match recall candidates are empty, fall back to recent user fact-like event logs.
- Only do this after filtering out:
  - assistant facts
  - question events
  - trivial messages

### 9. Dashboard presence does not equal retrievable recall

Seeing a `group` or an `episodic memory` in the dashboard does not guarantee the current API call is parsing or ranking it correctly.

You must distinguish:

- group exists
- memory exists in cloud
- API returns it
- parser extracts it
- local filter keeps it
- prompt injection uses it

These are different stages.

## Practical Debugging Checklist

When recall looks wrong, check in this order.

### Stage 1: Is the latest code actually running?

Backend should print a version marker like:

```text
[EverMem Recall Version] version=2026-03-15-recall-v4 ...
```

If not, you are testing an old process.

### Stage 2: Is `session_id` reaching the backend?

You should see:

```text
session_id=cloud_...::<uuid>
```

If not, frontend request payload is wrong.

### Stage 3: Is the current turn finalized?

You should see:

```text
[EverMem Stream] Finalized memory turn for session ...
```

If not, new memory may stay pending.

### Stage 4: Did the cloud API return anything?

Look at:

```text
[EverMem search debug] ...
[EverMem get debug] ...
```

Important fields:
- `group_ids`
- `memories=...`
- for `get memories`, preview should expose `atomic_fact`

### Stage 5: Did the local recall pipeline keep anything?

Look at:

```text
[EverMem Recall Scope] ...
[EverMem Recall Debug] ...
```

If cloud returned non-zero results but recall still shows zero, the problem is local filtering/parsing, not EverMem storage.

## Recommended Test Procedure

To test real long-term recall instead of immediate conversational context:

1. In chat A, say:

```text
I only remembered the suancai issue and ham sausage when we talked about March 15.
```

2. Wait until the backend logs:

```text
[EverMem Stream] Finalized memory turn for session ...
```

3. Open a new chat B.

4. Ask:

```text
What two food things did I say I remembered?
```

5. Check:
- `EverMem get debug`
- `EverMem Recall Scope`
- `EverMem Recall Debug`
- whether the assistant answers `suancai` and `ham sausage`

## Current Code Areas

The final working behavior depends on these files:

- `frontend/src/pages/AIChat.tsx`
- `backend/services/ai_service.py`
- `backend/services/evermem_service.py`
- `backend/tests/test_ai_memory_recall.py`

## Short Summary

The hard part was not "whether EverMem stored memory".

The hard part was aligning five layers at once:

1. frontend session propagation
2. turn finalization with `flush=true`
3. correct official API usage for `search` vs `get`
4. correct parsing of `scores` and `atomic_fact`
5. filtering out assistant facts and question-events before prompt injection

Once those were aligned, recall started returning the right facts instead of empty results or polluted summaries.
