"""
Recall Engine — pure recall / classification / scoring logic extracted from AIService.

This module contains stateless helpers that classify user messages, score and
rank memories, and finalize recall result sets. It has NO dependency on the
LLM client, provider config, or EverMem service — those concerns stay in
``AIService``, which orchestrates I/O and delegates pure logic here.

Any new recall-related helper should be added to ``RecallEngine``, not
``AIService``. ``AIService`` keeps a thin set of ``_foo(...)`` forwarding
wrappers so that existing callers (tests, chat orchestration) continue to
work without edits; those wrappers will be removed once callers migrate.
"""
import datetime
import logging
import re
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class RecallEngine:
    """Stateless recall / classification / scoring helpers."""

    RECALL_DEBUG_VERSION = "2026-03-15-recall-v5"

    RECALL_HINT_PATTERNS = (
        "remember",
        "remind me",
        "what did we talk",
        "what did i tell",
        "what do you remember",
        "do you remember",
        "previous chat",
        "last time",
        "earlier",
        "before",
        "mentioned before",
        "还记得",
        "记得我",
        "记不记得",
        "之前说",
        "之前聊",
        "上次说",
        "上次聊",
        "刚才说",
        "前面说",
        "我说过",
        "我们聊过",
    )

    IDENTITY_RECALL_PATTERNS = (
        "what is my name",
        "what's my name",
        "who am i",
        "do you know who i am",
        "do you remember who i am",
        "my name",
        "我的名字",
        "我叫什么",
        "你知道我是谁",
        "你记得我是谁",
        "我是谁",
    )

    REVIEW_RECALL_PATTERNS = (
        "weak on",
        "weak words",
        "often forget",
        "forget often",
        "difficult words",
        "review words",
        "which words am i still weak on",
        "which words do i often forget",
        "哪些词还不熟",
        "哪些词不牢",
        "薄弱词",
        "容易忘",
        "总忘",
        "复习得不好",
    )

    RECALL_TERM_EXPANSIONS = {
        "march 15": ("march 15", "march 15th", "3.15", "315", "消费者权益", "consumer rights"),
        "3.15": ("march 15", "march 15th", "3.15", "315", "消费者权益", "consumer rights"),
        "suancai": ("suancai", "酸菜", "pickled vegetable", "pickled vegetables"),
        "pickled vegetable": ("suancai", "酸菜", "pickled vegetable", "pickled vegetables"),
        "pickled vegetables": ("suancai", "酸菜", "pickled vegetable", "pickled vegetables"),
        "ham sausage": ("ham sausage", "ham sausages", "sausage", "sausages", "火腿肠"),
        "ham sausages": ("ham sausage", "ham sausages", "sausage", "sausages", "火腿肠"),
        "sausage": ("ham sausage", "ham sausages", "sausage", "sausages", "火腿肠"),
        "sausages": ("ham sausage", "ham sausages", "sausage", "sausages", "火腿肠"),
    }

    ASSISTANT_SUMMARY_PATTERNS = (
        "assistant responded",
        "assistant confirmed",
        "assistant provided",
        "assistant invited",
        "assistant clarified",
        "assistant's ",
        "assistant ",
        "the assistant ",
        "助理",
        "助手",
    )

    QUESTION_EVENT_PATTERNS = (
        "the user asked",
        "the user wondered",
        "the user questioned",
        "the user inquired",
        "asked what",
        "asked whether",
        "asked if",
        "asked who",
        "asked when",
        "asked where",
        "asked why",
        "asked how",
        "asked about",
    )

    ASSISTANT_EVENT_PATTERNS = (
        "the assistant ",
        "assistant said",
        "assistant asked",
        "assistant provided",
        "assistant complimented",
        "assistant explained",
        "assistant noted",
        "assistant suggested",
        "assistant stated",
        "assistant invited",
        "assistant responded",
        "assistant clarified",
    )

    USER_FACT_PATTERNS = (
        "the user said",
        "the user mentioned",
        "the user remembered",
        "the user recalled",
        "the user told",
        "the user shared",
        "the user noted",
        "the user explained",
    )

    IDENTITY_MEMORY_PATTERNS = (
        "xiao bao",
        "my name is",
        "the user's name",
        "the user said their name",
        "the user introduced themselves",
        "who they were",
        "who the user was",
        "remember me",
        "know who i am",
        "know who they are",
        "dota",
    )

    REVIEW_MEMORY_PATTERNS = (
        "[review_record]",
        "[review_session]",
        "current weaker review words",
        "current weak review words",
        "review session completed",
        "this word is still weak",
        "weak for the user",
        "this word seems reasonably stable",
        "difficult words tracked",
        "reviewed words",
        "reviewed the word",
        "reviewed word",
        "reviewed a word",
        "completed a review session",
        "rated it",
        "rated the word",
        "rating:",
        "next review",
        "difficulty signal",
        "复习单词",
        "当前难度信号",
        "评分:",
        "下次复习",
        "mistakes=",
        "ease=",
        "due now",
    )

    NEGATIVE_IDENTITY_PATTERNS = (
        "does not know or has not revealed their own name",
        "do not know their name",
        "does not know their name",
        "has not revealed their own name",
        "has not revealed their name",
        "uncertainty about self-identity",
        "lack of prior disclosure",
    )

    RECALL_STOPWORDS = {
        "what",
        "did",
        "tell",
        "you",
        "about",
        "that",
        "remember",
        "remembered",
        "earlier",
        "before",
        "when",
        "talked",
        "talking",
        "issue",
        "issues",
        "only",
        "mentioned",
        "mention",
        "said",
        "saying",
        "recall",
        "recalled",
        "conversation",
        "conversations",
        "chat",
        "chats",
        "march",
        "last",
        "time",
        "previous",
        "history",
        "records",
        "which",
        "words",
        "word",
        "weak",
        "still",
        "often",
        "forget",
        "forgot",
        "difficult",
        "review",
    }

    MEMORY_GUIDANCE_PATTERNS = (
        "help me",
        "suggest",
        "recommend",
        "plan",
        "goal",
        "next step",
        "improve",
        "practice",
        "review",
        "weak",
        "forget",
        "habit",
        "schedule",
        "preference",
        "based on",
        "according to",
        "帮我",
        "建议",
        "推荐",
        "计划",
        "目标",
        "下一步",
        "提高",
        "练习",
        "复习",
        "薄弱",
        "容易忘",
        "习惯",
        "偏好",
    )

    PERSONAL_CONTEXT_PATTERNS = (
        " my ",
        " i ",
        " i'm ",
        " i am ",
        " me ",
        " for me ",
        "我的",
        "我",
    )

    SKIP_PATTERNS = {
        # Greetings
        "你好", "hello", "hi", "hey", "嗨", "哈喽", "早上好", "晚上好", "下午好",
        # Acknowledgments
        "好的", "ok", "okay", "嗯", "嗯嗯", "好", "行", "可以", "明白", "了解",
        "谢谢", "thanks", "thank you", "thx", "感谢", "多谢",
        # Reactions
        "哈哈", "哈哈哈", "lol", "😂", "👍", "666", "厉害", "不错",
        "太棒了", "棒", "nice", "great", "cool", "wow",
        # Farewells
        "再见", "拜拜", "bye", "晚安", "good night",
    }

    # ------------------------------------------------------------------
    # normalization
    # ------------------------------------------------------------------

    @staticmethod
    def normalize_memory_content(content: str) -> str:
        return re.sub(r"^\[[^\]]+\]\s*", "", str(content or "")).strip()

    @staticmethod
    def review_memory_text(memory: Dict) -> str:
        return str(memory.get("raw_content") or memory.get("content", "")).strip()

    # ------------------------------------------------------------------
    # skip / store / retrieve gating
    # ------------------------------------------------------------------

    def should_skip_memory(self, user_msg: str) -> bool:
        msg = user_msg.strip().lower().rstrip("!！~.。？?")
        if len(msg) <= 2:
            return True
        if msg in self.SKIP_PATTERNS:
            return True
        return False

    def should_store_user_memory(self, user_msg: str) -> bool:
        normalized = re.sub(r"\s+", " ", str(user_msg or "").strip())
        if not normalized:
            return False
        if self.should_skip_memory(normalized):
            return False
        if self.is_memory_recall_request(normalized):
            return False

        ascii_tokens = re.findall(r"[a-zA-Z0-9']+", normalized)
        chinese_chars = re.findall(r"[\u4e00-\u9fff]", normalized)
        has_enough_length = len(normalized) >= 8
        has_multiple_tokens = len(ascii_tokens) >= 3 or len(chinese_chars) >= 4
        return has_enough_length or has_multiple_tokens

    def should_store_assistant_memory(self, assistant_text: str, user_msg: Optional[str] = None) -> bool:
        content = str(assistant_text or "").strip()
        if not content or content == "Sorry, I encountered an error. Please try again.":
            return False
        if user_msg is not None and not self.should_store_user_memory(user_msg):
            return False

        normalized = re.sub(r"\s+", " ", content)
        if len(normalized) < 24 and "\n" not in normalized:
            return False
        return True

    def should_retrieve_memory(self, user_msg: str) -> bool:
        normalized = re.sub(r"\s+", " ", str(user_msg or "").strip())
        if not normalized:
            return False
        if self.should_skip_memory(normalized):
            return False
        if self.is_memory_recall_request(normalized):
            return True
        if not self.should_store_user_memory(normalized):
            return False

        lowered = f" {normalized.lower()} "
        has_guidance_signal = any(
            pattern in lowered or pattern in normalized
            for pattern in self.MEMORY_GUIDANCE_PATTERNS
        )
        has_personal_context = (
            any(pattern in lowered for pattern in self.PERSONAL_CONTEXT_PATTERNS[:6])
            or any(pattern in normalized for pattern in self.PERSONAL_CONTEXT_PATTERNS[6:])
        )
        asks_question = "?" in normalized or "？" in normalized
        return has_guidance_signal and (has_personal_context or asks_question)

    # ------------------------------------------------------------------
    # recall request detection
    # ------------------------------------------------------------------

    def is_memory_recall_request(self, user_msg: str) -> bool:
        msg = user_msg.strip().lower()
        if not msg:
            return False
        return (
            any(pattern in msg for pattern in self.RECALL_HINT_PATTERNS)
            or self.looks_like_personal_fact_recall_request(msg)
            or self.is_identity_recall_request(user_msg)
            or self.is_review_recall_request(user_msg)
        )

    @staticmethod
    def looks_like_personal_fact_recall_request(msg: str) -> bool:
        normalized = re.sub(r"\s+", " ", msg.strip().lower())
        if not normalized:
            return False
        personal_fact_patterns = (
            r"^(what)\s+(is|was)\s+my\s+",
            r"^(what's)\s+my\s+",
            r"^(when)\s+(do|did)\s+i\s+",
            r"^(where)\s+(do|did)\s+i\s+",
            r"^(what)\s+(do|did)\s+i\s+",
            r"^(which)\s+\w+\s+(do|did)\s+i\s+",
        )
        return any(re.match(pattern, normalized) for pattern in personal_fact_patterns)

    def is_identity_recall_request(self, user_msg: str) -> bool:
        msg = user_msg.strip().lower()
        if not msg:
            return False
        return any(pattern in msg for pattern in self.IDENTITY_RECALL_PATTERNS)

    @staticmethod
    def is_review_recall_request(user_msg: str) -> bool:
        msg = user_msg.strip().lower()
        if not msg:
            return False
        return any(pattern in msg for pattern in RecallEngine.REVIEW_RECALL_PATTERNS)

    # ------------------------------------------------------------------
    # scope helpers
    # ------------------------------------------------------------------

    @staticmethod
    def build_memory_group_ids(session_id: Optional[str], recall_request: bool) -> Optional[List[str]]:
        if not session_id:
            return None
        return [session_id]

    @staticmethod
    def review_group_ids(user_id: str, weeks: int = 4) -> Optional[List[str]]:
        """ISO-week group_ids for the last ``weeks`` weeks of review data.

        Mirrors ``_review_group_ids_recent`` in review.py so AI recall search
        targets the same weekly-scoped groups that review records are written
        into. Returns ``None`` when ``user_id`` is empty.
        """
        if not user_id:
            return None
        today = datetime.date.today()
        group_ids: List[str] = []
        for offset in range(weeks):
            target = today - datetime.timedelta(weeks=offset)
            iso = target.isocalendar()
            tag = f"{iso.year}-W{iso.week:02d}"
            group_ids.append(f"{user_id}::review::{tag}")
        return group_ids if group_ids else None

    # ------------------------------------------------------------------
    # search term extraction
    # ------------------------------------------------------------------

    def extract_recall_search_terms(self, user_msg: str) -> List[str]:
        msg = user_msg.strip().lower()
        if not msg:
            return []

        terms = set()
        for phrase, expansions in self.RECALL_TERM_EXPANSIONS.items():
            if phrase in msg:
                terms.update(expansions)

        for token in re.findall(r"[a-z0-9\.]{3,}", msg):
            if token in self.RECALL_STOPWORDS:
                continue
            terms.add(token)

        for token in re.findall(r"[\u4e00-\u9fff]{1,6}", user_msg):
            if token not in {"之前", "记得", "前面", "刚才", "上次"}:
                terms.add(token)

        return sorted(terms, key=len, reverse=True)

    def build_recall_search_queries(self, user_msg: str) -> List[str]:
        terms = self.extract_recall_search_terms(user_msg)
        queries: List[str] = []

        normalized_original = user_msg.strip()
        if normalized_original:
            queries.append(normalized_original)

        if self.is_review_recall_request(user_msg):
            queries.extend([
                "weak words difficult words review words often forget",
                "current weaker review words",
                "this word is still weak",
                "review session completed",
            ])

        focused_terms = [
            term for term in terms
            if len(term) >= 5 or re.search(r"[\u4e00-\u9fff]", term)
        ]
        if focused_terms:
            queries.append(" ".join(focused_terms[:6]))
        elif any(
            pattern in normalized_original.lower()
            for pattern in self.IDENTITY_RECALL_PATTERNS
        ):
            queries.extend([
                "what is my name",
                "who am i",
                "remember me",
                "my name identity",
            ])

        queries.extend(focused_terms[:4])

        deduped_queries: List[str] = []
        seen = set()
        for query in queries:
            normalized = query.strip().lower()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            deduped_queries.append(query.strip())
        return deduped_queries

    def count_recall_term_matches(self, content: str, user_msg: str) -> int:
        normalized_content = self.normalize_memory_content(content).lower()
        terms = self.extract_recall_search_terms(user_msg)
        return sum(1 for term in terms if term.lower() in normalized_content)

    # ------------------------------------------------------------------
    # content classifiers
    # ------------------------------------------------------------------

    def looks_like_assistant_summary(self, content: str) -> bool:
        normalized = self.normalize_memory_content(content).lower()
        return any(pattern in normalized for pattern in self.ASSISTANT_SUMMARY_PATTERNS)

    def looks_like_question_event(self, content: str) -> bool:
        normalized = self.normalize_memory_content(content).lower()
        return any(pattern in normalized for pattern in self.QUESTION_EVENT_PATTERNS)

    def looks_like_assistant_event(self, content: str) -> bool:
        normalized = self.normalize_memory_content(content).lower()
        return any(pattern in normalized for pattern in self.ASSISTANT_EVENT_PATTERNS)

    def looks_like_user_fact(self, content: str) -> bool:
        normalized = self.normalize_memory_content(content).lower()
        return any(pattern in normalized for pattern in self.USER_FACT_PATTERNS)

    def looks_like_identity_memory(self, content: str) -> bool:
        normalized = self.normalize_memory_content(content).lower()
        return any(pattern in normalized for pattern in self.IDENTITY_MEMORY_PATTERNS)

    def looks_like_negative_identity_memory(self, content: str) -> bool:
        normalized = self.normalize_memory_content(content).lower()
        return any(pattern in normalized for pattern in self.NEGATIVE_IDENTITY_PATTERNS)

    def looks_like_review_memory(self, content: str) -> bool:
        normalized = self.normalize_memory_content(content).lower()
        return any(pattern in normalized for pattern in self.REVIEW_MEMORY_PATTERNS)

    # ------------------------------------------------------------------
    # formatting
    # ------------------------------------------------------------------

    @staticmethod
    def format_memory_context(memories: List[Dict], prefer_recent: bool = False) -> str:
        """Format retrieved memories into a compact, high-signal block for the model."""
        if not memories:
            return ""

        def memory_rank(item: Dict) -> tuple:
            memory_type = str(item.get("type", ""))
            score = float(item.get("score", 0.0))
            if not prefer_recent:
                return (0, -score)
            priority = {
                "episodic_memory": 0,
                "recent_memory": 1,
                "history": 2,
                "foresight": 2,
                "agent_case": 2,
                "agent_skill": 2,
                "profile": 3,
            }.get(memory_type, 2)
            return (priority, -score)

        ranked_memories = sorted(memories, key=memory_rank)[:5]

        lines = []
        for index, memory in enumerate(ranked_memories, start=1):
            score = float(memory.get("score", 0.0))
            content = str(memory.get("content", "")).strip()
            if not content:
                continue
            if len(content) > 220:
                content = f"{content[:217].rstrip()}..."
            lines.append(f"{index}. (score={score:.2f}) {content}")

        return "\n".join(lines)

    @staticmethod
    def summarize_memories_for_log(memories: List[Dict], limit: int = 5) -> str:
        if not memories:
            return "[]"
        parts = []
        for memory in memories[:limit]:
            memory_type = str(memory.get("type", "unknown"))
            score = float(memory.get("score", 0.0))
            content = str(memory.get("content", "")).strip().replace("\n", " ")
            if len(content) > 120:
                content = f"{content[:117].rstrip()}..."
            parts.append(f"{memory_type}@{score:.2f}: {content}")
        return " | ".join(parts)

    # ------------------------------------------------------------------
    # scoring
    # ------------------------------------------------------------------

    def score_event_log_memory(
        self, content: str, user_msg: str, timestamp: Optional[str] = None
    ) -> float:
        score = 2.0 + self.count_recall_term_matches(content, user_msg) * 1.5
        if timestamp:
            try:
                parsed = datetime.datetime.fromisoformat(
                    str(timestamp).replace("Z", "+00:00")
                )
                age_days = max(
                    0.0,
                    (datetime.datetime.now(datetime.timezone.utc) - parsed).total_seconds()
                    / 86400,
                )
                score += max(0.0, 1.0 - min(age_days, 30.0) / 30.0)
            except Exception:
                logger.debug(f"Failed to parse timestamp for scoring: {timestamp}")
        return score

    def score_review_memory(
        self, content: str, user_msg: str, timestamp: Optional[str] = None
    ) -> float:
        score = 4.0 + self.count_recall_term_matches(content, user_msg)
        if self.looks_like_review_memory(content):
            score += 2.5
        if timestamp:
            try:
                parsed = datetime.datetime.fromisoformat(
                    str(timestamp).replace("Z", "+00:00")
                )
                age_days = max(
                    0.0,
                    (datetime.datetime.now(datetime.timezone.utc) - parsed).total_seconds()
                    / 86400,
                )
                score += max(0.0, 1.0 - min(age_days, 14.0) / 14.0)
            except Exception:
                logger.debug(f"Failed to parse timestamp for review scoring: {timestamp}")
        return score

    @staticmethod
    def sort_memories_by_timestamp(memories: List[Dict]) -> List[Dict]:
        def sort_key(item: Dict) -> float:
            timestamp = item.get("timestamp")
            if not timestamp:
                return float("-inf")
            try:
                parsed = datetime.datetime.fromisoformat(
                    str(timestamp).replace("Z", "+00:00")
                )
                return parsed.timestamp()
            except Exception:
                logger.debug(f"Failed to parse timestamp for sorting: {timestamp}")
                return float("-inf")

        return sorted(memories, key=sort_key, reverse=True)

    # ------------------------------------------------------------------
    # ranking + finalization
    # ------------------------------------------------------------------

    def rank_recall_memories(self, memories: List[Dict], user_msg: str) -> List[Dict]:
        identity_request = self.is_identity_recall_request(user_msg)
        review_request = self.is_review_recall_request(user_msg)

        def sort_key(item: Dict) -> tuple:
            memory_type = str(item.get("type", ""))
            if identity_request:
                priority = {
                    "profile": 0,
                    "episodic_memory": 1,
                    "agent_case": 2,
                    "agent_skill": 2,
                    "history": 2,
                    "recent_memory": 3,
                    "foresight": 4,
                }.get(memory_type, 3)
            elif review_request:
                priority = {
                    "episodic_memory": 0,
                    "history": 1,
                    "recent_memory": 2,
                    "agent_case": 3,
                    "agent_skill": 3,
                    "foresight": 3,
                    "profile": 4,
                }.get(memory_type, 3)
            else:
                priority = {
                    "episodic_memory": 0,
                    "history": 1,
                    "recent_memory": 1,
                    "profile": 2,
                    "agent_case": 2,
                    "agent_skill": 2,
                    "foresight": 3,
                }.get(memory_type, 3)
            term_matches = int(item.get("term_matches", 0))
            score = float(item.get("score", 0.0))
            return (priority, -term_matches, -score)

        return sorted(memories, key=sort_key)

    def finalize_recall_memories(self, memories: List[Dict], user_msg: str) -> List[Dict]:
        identity_request = self.is_identity_recall_request(user_msg)
        review_request = self.is_review_recall_request(user_msg)
        deduped: List[Dict] = []
        seen = set()
        for memory in memories:
            content = str(memory.get("content", "")).strip()
            normalized_content = self.normalize_memory_content(content)
            if not normalized_content or normalized_content in seen:
                continue
            seen.add(normalized_content)
            enriched = dict(memory)
            enriched["term_matches"] = self.count_recall_term_matches(content, user_msg)
            deduped.append(enriched)

        if not identity_request:
            non_profile_memories = [
                memory for memory in deduped
                if str(memory.get("type", "")) != "profile"
            ]
            if non_profile_memories:
                deduped = non_profile_memories

        strongly_matching = [
            memory for memory in deduped
            if int(memory.get("term_matches", 0)) >= 1
        ]
        if strongly_matching:
            deduped = strongly_matching
        elif deduped and not identity_request:
            return []

        user_like_memories = [
            memory for memory in deduped
            if not self.looks_like_assistant_summary(str(memory.get("content", "")))
        ]
        if user_like_memories:
            deduped = user_like_memories

        if identity_request:
            profile_memories = [
                memory for memory in deduped
                if str(memory.get("type", "")) == "profile"
                and not self.looks_like_negative_identity_memory(
                    str(memory.get("content", ""))
                )
            ]
            if profile_memories:
                deduped = profile_memories
            else:
                identity_memories = [
                    memory for memory in deduped
                    if self.looks_like_identity_memory(str(memory.get("content", "")))
                    and not self.looks_like_negative_identity_memory(
                        str(memory.get("content", ""))
                    )
                ]
                if identity_memories:
                    deduped = identity_memories
                else:
                    return []
        elif review_request:
            review_memories = [
                memory for memory in deduped
                if self.looks_like_review_memory(str(memory.get("content", "")))
            ]
            if review_memories:
                deduped = review_memories
            else:
                return []

        return self.rank_recall_memories(deduped, user_msg)

    def build_recent_session_fallback_memories(
        self,
        event_logs: List[Dict],
        user_msg: str,
        limit: int = 3,
    ) -> List[Dict]:
        """Fall back to recent user event logs when recall yields nothing in
        the live session — useful for vague follow-ups mid-conversation."""
        fallback_candidates: List[Dict] = []
        normalized_user_msg = self.normalize_memory_content(user_msg).lower()
        review_request = self.is_review_recall_request(user_msg)

        for event in self.sort_memories_by_timestamp(event_logs):
            content = str(event.get("content", "")).strip()
            review_content = self.review_memory_text(event)
            if not content:
                continue
            normalized_content = self.normalize_memory_content(content).lower()
            if normalized_content == normalized_user_msg:
                continue
            if self.should_skip_memory(content):
                continue
            if self.looks_like_assistant_summary(content):
                continue
            if self.looks_like_question_event(content):
                continue
            if self.looks_like_assistant_event(content):
                continue
            if review_request and not self.looks_like_review_memory(review_content):
                continue
            display_content = review_content if review_request else content
            fallback_candidates.append({
                "content": f"[事件记录] {display_content}",
                "type": "event_log",
                "score": (
                    self.score_review_memory(
                        display_content, user_msg, event.get("timestamp")
                    )
                    if review_request
                    else self.score_event_log_memory(
                        content, user_msg, event.get("timestamp")
                    )
                    + (1.5 if self.looks_like_user_fact(content) else 0.0)
                ),
                "group_id": event.get("group_id"),
                "timestamp": event.get("timestamp"),
                "term_matches": self.count_recall_term_matches(
                    display_content, user_msg
                ),
            })
            if len(fallback_candidates) >= limit:
                break

        return fallback_candidates

    # ------------------------------------------------------------------
    # Legacy aliases
    # ------------------------------------------------------------------
    # External code (and some internal call sites still in AIService) refer
    # to these constants as ``AIService._FOO``. Point each of those at the
    # canonical ``RecallEngine.FOO`` attribute so the old name keeps working
    # until callers migrate. Methods are not aliased here — ``AIService``
    # keeps its own thin ``_method`` forwarding wrappers for those.

    _RECALL_DEBUG_VERSION = RECALL_DEBUG_VERSION
    _RECALL_HINT_PATTERNS = RECALL_HINT_PATTERNS
    _IDENTITY_RECALL_PATTERNS = IDENTITY_RECALL_PATTERNS
    _REVIEW_RECALL_PATTERNS = REVIEW_RECALL_PATTERNS
    _RECALL_TERM_EXPANSIONS = RECALL_TERM_EXPANSIONS
    _ASSISTANT_SUMMARY_PATTERNS = ASSISTANT_SUMMARY_PATTERNS
    _QUESTION_EVENT_PATTERNS = QUESTION_EVENT_PATTERNS
    _ASSISTANT_EVENT_PATTERNS = ASSISTANT_EVENT_PATTERNS
    _USER_FACT_PATTERNS = USER_FACT_PATTERNS
    _IDENTITY_MEMORY_PATTERNS = IDENTITY_MEMORY_PATTERNS
    _REVIEW_MEMORY_PATTERNS = REVIEW_MEMORY_PATTERNS
    _NEGATIVE_IDENTITY_PATTERNS = NEGATIVE_IDENTITY_PATTERNS
    _RECALL_STOPWORDS = RECALL_STOPWORDS
    _MEMORY_GUIDANCE_PATTERNS = MEMORY_GUIDANCE_PATTERNS
    _PERSONAL_CONTEXT_PATTERNS = PERSONAL_CONTEXT_PATTERNS
    _SKIP_PATTERNS = SKIP_PATTERNS
