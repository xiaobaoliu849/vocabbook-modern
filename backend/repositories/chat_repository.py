from models.database import DatabaseManager


class ChatSessionRepository:
    """Persistence boundary for durable chat sessions."""

    def __init__(self, db: DatabaseManager):
        self.db = db

    def list_sessions(self, owner_key: str):
        return self.db.get_all_chat_sessions(owner_key=owner_key)

    def save_session(self, session_data: dict, owner_key: str) -> bool:
        return self.db.save_chat_session(session_data, owner_key=owner_key)

    def delete_session(self, session_id: str, owner_key: str) -> bool:
        return self.db.delete_chat_session(session_id, owner_key=owner_key)

    def clear_sessions(self, owner_key: str) -> bool:
        return self.db.clear_all_chat_sessions(owner_key=owner_key)
