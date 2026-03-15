import os
import httpx
from datetime import datetime
from models.database import DatabaseManager

class LimitException(Exception):
    def __init__(self, message: str, required_tier: str):
        self.message = message
        self.required_tier = required_tier
        super().__init__(self.message)

class LimitService:
    def __init__(self, db: DatabaseManager):
        self.db = db
        self.cloud_api_url = os.getenv('VOCABBOOK_CLOUD_API_URL', 'http://localhost:8001').rstrip('/')
        # Free limits per day
        self.LIMITS = {
            'ai_chat': 10,
            'tts': 30,
            'ai_generate': 15,
            'ai_translate': 20
        }

    def _reset_if_needed(self, feature: str):
        """Reset limits if the date has changed"""
        today = datetime.now().strftime('%Y-%m-%d')
        conn = self.db.get_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT used_count, last_reset_date FROM user_limits WHERE feature = ?', (feature,))
        row = cursor.fetchone()
        
        if row is None:
            # First time using this feature
            cursor.execute('''
                INSERT INTO user_limits (feature, used_count, last_reset_date)
                VALUES (?, 0, ?)
            ''', (feature, today))
            conn.commit()
            return 0
        
        used_count, last_reset_date = row
        if last_reset_date != today:
            # New day, reset
            cursor.execute('''
                UPDATE user_limits 
                SET used_count = 0, last_reset_date = ? 
                WHERE feature = ?
            ''', (today, feature))
            conn.commit()
            return 0
            
        return used_count
        
    def _increment_limit(self, feature: str):
        today = datetime.now().strftime('%Y-%m-%d')
        conn = self.db.get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE user_limits 
            SET used_count = used_count + 1 
            WHERE feature = ?
        ''', (feature,))
        conn.commit()

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
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        f"{self.cloud_api_url}/users/me",
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=3.0
                    )
                    if resp.status_code == 200:
                        user_data = resp.json()
                        tier = user_data.get('tier', 'free')
            except Exception as e:
                print(f"Failed to check user tier: {e}")
                # Fallback to free tier on error
                
        # 2. Premium users have no limits
        if tier == 'premium':
            return True
            
        # 3. Check Free Limits
        max_allowed = self.LIMITS.get(feature, 5)
        current_used = self._reset_if_needed(feature)
        
        if current_used >= max_allowed:
            raise LimitException(
                message=f"本日免费额度已用完 ({max_allowed}次)。请登录账号并订阅高级版以继续使用。", 
                required_tier="premium"
            )
            
        # 4. Consume
        self._increment_limit(feature)
        return True

    def get_remaining(self, feature: str, token: str = None) -> dict:
        """Returns remaining limit usage info for UI"""
        max_allowed = self.LIMITS.get(feature, 5)
        current_used = self._reset_if_needed(feature)
        return {
            "feature": feature,
            "used": current_used,
            "max": max_allowed,
            "remaining": max(0, max_allowed - current_used)
        }
