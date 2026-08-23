import os
from datetime import datetime
from models.database import DatabaseManager
from services.blocking_io import run_db_blocking
from services.http_client import get_http_client
import logging

logger = logging.getLogger(__name__)

class LimitException(Exception):
    def __init__(self, message: str, required_tier: str):
        self.message = message
        self.required_tier = required_tier
        super().__init__(self.message)

class LimitService:
    def __init__(self, db: DatabaseManager):
        self.db = db
        self.cloud_api_url = os.getenv('VOCABBOOK_CLOUD_API_URL', 'http://localhost:8001').rstrip('/')
        # Free limits per day (configurable via env vars)
        self.LIMITS = {
            'ai_chat': self._env_limit('VOCABBOOK_LIMIT_AI_CHAT', 10),
            'tts': self._env_limit('VOCABBOOK_LIMIT_TTS', 30),
            'ai_generate': self._env_limit('VOCABBOOK_LIMIT_AI_GENERATE', 15),
            'ai_translate': self._env_limit('VOCABBOOK_LIMIT_AI_TRANSLATE', 20),
        }

    @staticmethod
    def _env_limit(env_var: str, default: int) -> int:
        """Read a rate limit from env var, fall back to default on bad input."""
        raw = os.getenv(env_var)
        if raw is None:
            return default
        try:
            return int(raw)
        except ValueError:
            logger.warning(f"[LimitService] Invalid {env_var}={raw!r}, using default {default}")
            return default

    def _consume(self, feature: str, max_allowed: int) -> tuple:
        """Atomically take one unit of the daily quota for ``feature``.

        Single conditional upsert: inserts the row on first use, resets a
        stale date, or increments — all inside one statement under SQLite's
        write lock. The DO UPDATE ... WHERE gate means an exhausted quota
        (same-day count already at the cap) leaves the row untouched, so
        concurrent requests can neither race the UNIQUE insert into a 500
        nor push the counter past the cap.

        Returns ``(consumed, used_count)`` where ``consumed`` mirrors the
        statement's rowcount: True when the insert/reset/increment fired,
        False when the quota was already exhausted today.
        """
        today = datetime.now().strftime('%Y-%m-%d')
        conn = self.db.get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO user_limits (feature, used_count, last_reset_date)
            VALUES (?, 1, ?)
            ON CONFLICT(feature) DO UPDATE SET
                used_count = CASE
                    WHEN user_limits.last_reset_date < excluded.last_reset_date THEN 1
                    ELSE user_limits.used_count + 1
                END,
                last_reset_date = excluded.last_reset_date
            WHERE user_limits.last_reset_date < excluded.last_reset_date
               OR user_limits.used_count < ?
        ''', (feature, today, max_allowed))
        consumed = cursor.rowcount > 0
        cursor.execute(
            'SELECT used_count FROM user_limits WHERE feature = ?', (feature,)
        )
        row = cursor.fetchone()
        conn.commit()
        return consumed, (row[0] if row else 0)

    def _get_effective_used(self, feature: str) -> int:
        """Read-only view of today's usage (0 for a missing/stale row)."""
        today = datetime.now().strftime('%Y-%m-%d')
        conn = self.db.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT used_count, last_reset_date FROM user_limits WHERE feature = ?', (feature,))
        row = cursor.fetchone()
        if row is None:
            return 0
        used_count, last_reset_date = row
        return used_count if (last_reset_date or '') >= today else 0

    async def check_and_consume(self, feature: str, token: str = None) -> bool:
        """
        Check if user can use the feature. 
        If user has a token, we check with cloud server for premium status.
        If premium, pass.
        If free or no token, check local daily limits.
        """
        tier = 'free'
        
        # 1. Check token with Cloud Server
        if token:
            try:
                client = get_http_client()
                resp = await client.get(
                    f"{self.cloud_api_url}/users/me",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=3.0
                )
                if resp.status_code == 200:
                    user_data = resp.json()
                    tier = user_data.get('tier', 'free')
            except Exception as e:
                logger.error(f"Failed to check user tier: {e}")
                # Fallback to free tier on error
                
        # 2. Premium users have no limits
        if tier == 'premium':
            return True
            
        # 3. Check Free Limits — consume atomically; rowcount tells whether
        # this request actually took a unit (False = quota already spent).
        max_allowed = self.LIMITS.get(feature, 5)
        if max_allowed <= 0:
            raise LimitException(
                message=f"本日免费额度已用完 ({max_allowed}次)。请登录账号并订阅高级版以继续使用。",
                required_tier="premium"
            )
        consumed, _used_count = await run_db_blocking(self._consume, feature, max_allowed)
        if not consumed:
            raise LimitException(
                message=f"本日免费额度已用完 ({max_allowed}次)。请登录账号并订阅高级版以继续使用。",
                required_tier="premium"
            )
        return True

    def get_remaining(self, feature: str, token: str = None) -> dict:
        """Returns remaining limit usage info for UI"""
        max_allowed = self.LIMITS.get(feature, 5)
        current_used = self._get_effective_used(feature)
        return {
            "feature": feature,
            "used": current_used,
            "max": max_allowed,
            "remaining": max(0, max_allowed - current_used)
        }
